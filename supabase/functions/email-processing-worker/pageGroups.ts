import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { Buffer } from 'node:buffer';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.24.1';

export interface PageGroupConfig {
  id: string;
  transformation_type_id: string;
  group_order: number;
  pages_per_group: number;
  process_mode: string;
  smart_detection_pattern: string | null;
  workflow_id: string | null;
  workflow_version: string | null;
  workflow_v2_id: string | null;
  filename_template: string | null;
  field_mappings: any | null;
  use_ai_detection: boolean | null;
  fallback_behavior: string | null;
  detection_confidence_threshold: number | null;
  follows_previous_group: boolean | null;
  detection_mode: string | null;
  name: string | null;
}

export interface PageGroupAssignment {
  pageIndex: number;
  groupConfig: PageGroupConfig;
  base64: string;
}

async function getActiveGeminiApiKey(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('gemini_api_keys')
    .select('id, api_key')
    .eq('is_active', true)
    .maybeSingle();
  return data?.api_key || null;
}

async function getActiveModelName(supabase: any): Promise<string> {
  try {
    const { data: keyRow } = await supabase
      .from('gemini_api_keys')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();
    if (keyRow) {
      const { data: modelRow } = await supabase
        .from('gemini_models')
        .select('model_name')
        .eq('api_key_id', keyRow.id)
        .eq('is_active', true)
        .maybeSingle();
      if (modelRow?.model_name) return modelRow.model_name;
    }
  } catch (err) {
    console.warn('[PAGE_GROUPS] Failed to load active model name:', err);
  }
  return 'gemini-2.5-pro';
}

async function extractSinglePageBase64(pdfDoc: PDFDocument, pageIndex: number): Promise<string> {
  const singlePageDoc = await PDFDocument.create();
  const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageIndex]);
  singlePageDoc.addPage(copiedPage);
  const pdfBytes = await singlePageDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

async function extractSinglePageText(model: any, pageBase64: string): Promise<string> {
  if (!model) return '';
  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: pageBase64 } },
      'Extract ALL text content from this single PDF page. Return only the raw text, preserving the reading order. No commentary, no formatting, no markdown.'
    ]);
    return result.response.text().trim();
  } catch {
    return '';
  }
}

async function extractTextFromAllPages(
  pdfDoc: PDFDocument,
  totalPages: number,
  supabase: any
): Promise<string[]> {
  const apiKey = await getActiveGeminiApiKey(supabase);
  if (!apiKey) {
    console.warn('[PAGE_GROUPS] No Gemini API key for text extraction, returning empty texts');
    return new Array(totalPages).fill('');
  }
  const modelName = await getActiveModelName(supabase);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const pageTexts: string[] = [];
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    try {
      const pageBase64 = await extractSinglePageBase64(pdfDoc, pageIdx);
      const result = await model.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: pageBase64 } },
        'Extract ALL text content from this single PDF page. Return only the raw text, preserving reading order. No commentary or markdown.'
      ]);
      pageTexts.push(result.response.text().trim());
    } catch (err) {
      console.error(`[PAGE_GROUPS] Text extract failed page ${pageIdx + 1}:`, err);
      pageTexts.push('');
    }
  }
  return pageTexts;
}

async function detectWithAI(
  pageText: string,
  pattern: string,
  confidenceThreshold: number,
  supabase: any
): Promise<{ match: boolean; confidence: number }> {
  const apiKey = await getActiveGeminiApiKey(supabase);
  if (!apiKey) throw new Error('No active Gemini API key configured');
  const modelName = await getActiveModelName(supabase);
  const prompt = `You are a pattern detection AI analyzing PDF text content. Determine if the provided text matches the given pattern.

PATTERN TO DETECT:
${pattern}

PAGE TEXT CONTENT:
${pageText}

Respond with valid JSON only:
{"match": true|false, "confidence": 0.0 to 1.0, "reasoning": "brief"}`;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const cleaned = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return { match: parsed.confidence >= confidenceThreshold, confidence: parsed.confidence || 0 };
}

async function detectPageMatchesGroupConfig(
  pageText: string,
  groupConfig: PageGroupConfig,
  supabase: any
): Promise<boolean> {
  if (!groupConfig.smart_detection_pattern?.trim()) return false;
  const threshold = groupConfig.detection_confidence_threshold || 0.7;
  if (groupConfig.use_ai_detection) {
    try {
      const aiResult = await detectWithAI(pageText, groupConfig.smart_detection_pattern, threshold, supabase);
      return aiResult.match && aiResult.confidence >= threshold;
    } catch (err) {
      console.error('[PAGE_GROUPS] AI detect failed, falling back to text match:', err);
      return pageText.toLowerCase().includes(groupConfig.smart_detection_pattern.toLowerCase());
    }
  }
  return pageText.toLowerCase().includes(groupConfig.smart_detection_pattern.toLowerCase());
}

async function assignPagesSequential(
  pdfDoc: PDFDocument,
  totalPages: number,
  sortedConfigs: PageGroupConfig[]
): Promise<PageGroupAssignment[]> {
  const assignments: PageGroupAssignment[] = [];
  let currentPage = 0;
  while (currentPage < totalPages) {
    for (const groupConfig of sortedConfigs) {
      if (currentPage >= totalPages) break;
      const pagesForGroup = groupConfig.process_mode === 'single' ? 1 : groupConfig.pages_per_group;
      for (let i = 0; i < pagesForGroup && currentPage < totalPages; i++) {
        const base64 = await extractSinglePageBase64(pdfDoc, currentPage);
        assignments.push({ pageIndex: currentPage, groupConfig, base64 });
        console.log(`[PAGE_GROUPS] Page ${currentPage + 1} -> Group ${groupConfig.group_order} (sequential)`);
        currentPage++;
      }
    }
  }
  return assignments;
}

async function assignPagesSequentialDetection(
  pdfDoc: PDFDocument,
  totalPages: number,
  sortedConfigs: PageGroupConfig[],
  supabase: any
): Promise<PageGroupAssignment[]> {
  const leadConfig = sortedConfigs.find(c => !c.follows_previous_group && c.smart_detection_pattern?.trim());
  if (!leadConfig) {
    console.log('[PAGE_GROUPS] No lead detection config, falling back to sequential');
    return assignPagesSequential(pdfDoc, totalPages, sortedConfigs);
  }
  const nonLead = sortedConfigs.filter(c => c.group_order !== leadConfig.group_order);
  const isSimpleRepeating = nonLead.length > 0 && nonLead.every(c => c.follows_previous_group);
  const groupPages: Map<number, number[]> = new Map();
  for (const c of sortedConfigs) groupPages.set(c.group_order, []);

  if (isSimpleRepeating) {
    console.log('[PAGE_GROUPS] Simple repeating pattern - round-robin assignment');
    let pageIdx = 0;
    while (pageIdx < totalPages) {
      const leadCount = leadConfig.process_mode === 'single' ? 1 : leadConfig.pages_per_group;
      for (let i = 0; i < leadCount && pageIdx < totalPages; i++) {
        groupPages.get(leadConfig.group_order)!.push(pageIdx);
        pageIdx++;
      }
      for (const follower of sortedConfigs) {
        if (!follower.follows_previous_group || pageIdx >= totalPages) continue;
        const cnt = follower.process_mode === 'single' ? 1 : follower.pages_per_group;
        for (let i = 0; i < cnt && pageIdx < totalPages; i++) {
          groupPages.get(follower.group_order)!.push(pageIdx);
          pageIdx++;
        }
      }
    }
  } else {
    const pageTexts = await extractTextFromAllPages(pdfDoc, totalPages, supabase);
    let pageIdx = 0;
    while (pageIdx < totalPages) {
      const matched = await detectPageMatchesGroupConfig(pageTexts[pageIdx] || '', leadConfig, supabase);
      if (matched) {
        const leadCount = leadConfig.process_mode === 'single' ? 1 : leadConfig.pages_per_group;
        for (let i = 0; i < leadCount && pageIdx < totalPages; i++) {
          groupPages.get(leadConfig.group_order)!.push(pageIdx);
          pageIdx++;
        }
        for (const follower of sortedConfigs) {
          if (!follower.follows_previous_group || pageIdx >= totalPages) continue;
          const cnt = follower.process_mode === 'single' ? 1 : follower.pages_per_group;
          for (let i = 0; i < cnt && pageIdx < totalPages; i++) {
            groupPages.get(follower.group_order)!.push(pageIdx);
            pageIdx++;
          }
        }
      } else {
        console.log(`[PAGE_GROUPS] Page ${pageIdx + 1} -> no lead match, skipping`);
        pageIdx++;
      }
    }
  }

  const assignments: PageGroupAssignment[] = [];
  for (const cfg of sortedConfigs) {
    const pages = groupPages.get(cfg.group_order) || [];
    for (const p of pages) {
      const base64 = await extractSinglePageBase64(pdfDoc, p);
      assignments.push({ pageIndex: p, groupConfig: cfg, base64 });
    }
  }
  assignments.sort((a, b) => a.pageIndex - b.pageIndex || a.groupConfig.group_order - b.groupConfig.group_order);
  return assignments;
}

async function assignPagesPerPageDetection(
  pdfDoc: PDFDocument,
  totalPages: number,
  sortedConfigs: PageGroupConfig[],
  supabase: any
): Promise<PageGroupAssignment[]> {
  const aiConfigs = sortedConfigs.filter(c => c.use_ai_detection && c.smart_detection_pattern?.trim());
  const textOnly = sortedConfigs.filter(c => !c.use_ai_detection && c.smart_detection_pattern?.trim());
  let model: any = null;
  if (aiConfigs.length > 0) {
    const apiKey = await getActiveGeminiApiKey(supabase);
    if (apiKey) {
      const modelName = await getActiveModelName(supabase);
      const genAI = new GoogleGenerativeAI(apiKey);
      model = genAI.getGenerativeModel({ model: modelName });
    } else {
      console.warn('[PAGE_GROUPS] No Gemini API key; AI configs will fall back to text match');
    }
  }

  const assignments: PageGroupAssignment[] = [];
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageBase64 = await extractSinglePageBase64(pdfDoc, pageIdx);
    let bestMatch: { config: PageGroupConfig; confidence: number } | null = null;

    if (model && aiConfigs.length > 0) {
      try {
        const groupPatterns = aiConfigs.map((cfg, i) =>
          `Pattern ${i + 1} (group_order ${cfg.group_order}): ${cfg.smart_detection_pattern}`
        ).join('\n');
        const prompt = `You are a pattern detection AI analyzing a PDF page. Evaluate EACH pattern INDEPENDENTLY and return a confidence for each.

PATTERNS:
${groupPatterns}

Respond with valid JSON only:
{"results":[{"group_order":<n>,"confidence":<0.0-1.0>,"reasoning":"brief"}]}`;
        const result = await model.generateContent([
          { inlineData: { mimeType: 'application/pdf', data: pageBase64 } },
          prompt
        ]);
        const cleaned = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.results)) {
          for (const r of parsed.results) {
            const cfg = aiConfigs.find(c => c.group_order === r.group_order);
            if (!cfg) continue;
            const threshold = cfg.detection_confidence_threshold || 0.7;
            console.log(`[PAGE_GROUPS] Page ${pageIdx + 1} group ${r.group_order} confidence=${r.confidence?.toFixed?.(2) ?? r.confidence} threshold=${threshold}`);
            if (r.confidence >= threshold && (!bestMatch || r.confidence > bestMatch.confidence)) {
              bestMatch = { config: cfg, confidence: r.confidence };
            }
          }
        }
      } catch (err) {
        console.error(`[PAGE_GROUPS] AI classification failed for page ${pageIdx + 1}:`, err);
      }
    }

    if (!bestMatch && textOnly.length > 0) {
      const pageText = await extractSinglePageText(model, pageBase64);
      for (const cfg of textOnly) {
        if (pageText.toLowerCase().includes(cfg.smart_detection_pattern!.toLowerCase())) {
          if (!bestMatch || 0.9 > bestMatch.confidence) bestMatch = { config: cfg, confidence: 0.9 };
        }
      }
    }

    if (bestMatch) {
      assignments.push({ pageIndex: pageIdx, groupConfig: bestMatch.config, base64: pageBase64 });
      console.log(`[PAGE_GROUPS] Page ${pageIdx + 1} -> Group ${bestMatch.config.group_order} (confidence ${bestMatch.confidence.toFixed(2)})`);
    } else {
      console.log(`[PAGE_GROUPS] Page ${pageIdx + 1} -> no group matched, skipping`);
    }
  }
  return assignments;
}

export async function assignPagesToGroups(
  pdfBase64: string,
  sortedConfigs: PageGroupConfig[],
  supabase: any
): Promise<{ assignments: PageGroupAssignment[]; totalPages: number }> {
  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();

  const isFixedSequence = sortedConfigs.some(c => c.detection_mode === 'fixed_sequence');
  const withDetection = sortedConfigs.filter(c => c.smart_detection_pattern?.trim());

  let assignments: PageGroupAssignment[];
  if (isFixedSequence || withDetection.length === 0) {
    console.log('[PAGE_GROUPS] Strategy: sequential fixed-position');
    assignments = await assignPagesSequential(pdfDoc, totalPages, sortedConfigs);
  } else if (sortedConfigs.some(c => c.follows_previous_group)) {
    console.log('[PAGE_GROUPS] Strategy: sequential-detection with followers');
    assignments = await assignPagesSequentialDetection(pdfDoc, totalPages, sortedConfigs, supabase);
  } else {
    console.log('[PAGE_GROUPS] Strategy: per-page independent detection');
    assignments = await assignPagesPerPageDetection(pdfDoc, totalPages, sortedConfigs, supabase);
  }
  return { assignments, totalPages };
}
