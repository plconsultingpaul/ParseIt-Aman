import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { Buffer } from 'node:buffer';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.24.1';
import { getSupabaseUrl, getSupabaseServiceKey, getActiveGeminiApiKey, getActiveModelName } from '../../config.ts';
import { EmailProvider, getPostProcessAction } from '../services/email-base.ts';
import { LoggingService } from '../services/logging.ts';
import type {
  PdfAttachment,
  TransformationType,
  SftpConfig,
  ProcessingRule,
  EmailMonitoringConfig,
  ProcessEmailResult,
  AttachmentProcessResult,
} from '../../types.ts';

interface PageGroupConfig {
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

interface PageGroupAssignment {
  pageIndex: number;
  groupConfig: PageGroupConfig;
  base64: string;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  maxAttempts = 3,
  initialDelayMs = 3000
): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(url, options);
    if (resp.ok || attempt === maxAttempts) return resp;

    const status = resp.status;
    if (status !== 503 && status !== 429 && status !== 500) return resp;

    const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt - 1), 10000);
    console.warn(`${label}: attempt ${attempt}/${maxAttempts} got ${status}, retrying in ${delayMs}ms`);
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`${label}: unreachable`);
}

export async function handleTransformationMode(
  emailId: string,
  provider: EmailProvider,
  matchingRule: ProcessingRule,
  fromEmail: string,
  subject: string,
  receivedDate: string,
  sftpConfig: SftpConfig | null,
  supabase: any,
  logger: LoggingService,
  config: EmailMonitoringConfig
): Promise<ProcessEmailResult> {
  let attachments: PdfAttachment[] = [];
  let processedSuccessfully = false;
  let errorMessage: string | null = null;
  let extractionLogId: string | null = null;

  try {
    attachments = await provider.findPdfAttachments(emailId);
    console.log('Transform mode - PDF attachments:', {
      count: attachments.length,
      filenames: attachments.map(att => att.filename)
    });

    if (attachments.length === 0) {
      console.log('No PDF attachments found, applying post-process action to clear from queue');
      const { action, folderPath } = getPostProcessAction(config, 'failure');
      await provider.applyPostProcessAction(emailId, action, folderPath);
      return buildResult(emailId, fromEmail, subject, receivedDate, false, 'No PDF attachments found', null, [], matchingRule);
    }

    const transformationType = matchingRule.transformation_types as TransformationType | null;
    if (!transformationType) {
      console.error('Transformation type not found for rule:', matchingRule.rule_name);
      return buildResult(emailId, fromEmail, subject, receivedDate, false, `Transformation type not found for rule: ${matchingRule.rule_name}`, null, attachments, matchingRule);
    }

    console.log('Using transformation type:', transformationType.name, 'version:', transformationType.workflow_version || 'v1');

    const { data: pageGroupConfigs } = await supabase
      .from('page_group_configs')
      .select('*')
      .eq('transformation_type_id', transformationType.id)
      .order('group_order', { ascending: true });

    const hasPageGroups = pageGroupConfigs && pageGroupConfigs.length > 0;
    console.log('Page group configs found:', hasPageGroups ? pageGroupConfigs.length : 0);

    if (hasPageGroups) {
      for (const attachment of attachments) {
        const result = await processAttachmentWithPageGroups(
          attachment,
          transformationType,
          pageGroupConfigs,
          sftpConfig,
          supabase,
          logger,
          fromEmail,
          subject,
        );

        if (result.success) {
          processedSuccessfully = true;
          extractionLogId = result.extractionLogId;
        } else {
          errorMessage = result.error || 'Unknown transformation error';
        }
      }
    } else {
      const pagesPerGroup = transformationType.pages_per_group || 1;
      console.log('Pages per group:', pagesPerGroup);

      for (const attachment of attachments) {
        let pagesToProcess: PdfAttachment[] = [attachment];

        if (pagesPerGroup === 1 && attachment.pageCount > 1) {
          console.log(`Splitting ${attachment.filename} (${attachment.pageCount} pages) into individual pages for one-page-per-group processing`);
          pagesToProcess = await splitPdfAttachmentIntoPages(attachment);
          console.log(`Split into ${pagesToProcess.length} single-page PDFs`);
        }

        for (const pageAttachment of pagesToProcess) {
          const result = await processTransformAttachment(
            pageAttachment,
            transformationType,
            sftpConfig,
            supabase,
            logger,
            fromEmail,
            subject,
          );

          if (result.success) {
            processedSuccessfully = true;
            extractionLogId = result.extractionLogId;
          } else {
            errorMessage = result.error || 'Unknown transformation error';
          }
        }
      }
    }

    const postProcessStatus = processedSuccessfully ? 'success' : 'failure';
    const { action, folderPath } = getPostProcessAction(config, postProcessStatus);
    await provider.applyPostProcessAction(emailId, action, folderPath);

  } catch (emailError) {
    console.error('Error in transformation handler:', emailError);
    errorMessage = (emailError as Error).message || 'Unknown transformation error';

    try {
      const { action, folderPath } = getPostProcessAction(config, 'failure');
      await provider.applyPostProcessAction(emailId, action, folderPath);
    } catch (postProcessError) {
      console.error('Error applying post-process action on failure:', postProcessError);
    }
  }

  return buildResult(emailId, fromEmail, subject, receivedDate, processedSuccessfully, errorMessage, extractionLogId, attachments, matchingRule);
}

async function processAttachmentWithPageGroups(
  attachment: PdfAttachment,
  transformationType: TransformationType,
  pageGroupConfigs: PageGroupConfig[],
  sftpConfig: SftpConfig | null,
  supabase: any,
  logger: LoggingService,
  fromEmail: string,
  subject: string,
): Promise<AttachmentProcessResult> {
  let extractionLogId: string | null = null;

  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseServiceKey = getSupabaseServiceKey();
    const sessionId = `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`=== PAGE GROUP PROCESSING START (session: ${sessionId}) ===`);
    console.log(`Attachment: ${attachment.filename}, Pages: ${attachment.pageCount}`);

    const pdfBuffer = Buffer.from(attachment.base64, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();

    const sortedConfigs = [...pageGroupConfigs].sort((a, b) => a.group_order - b.group_order);

    const pageAssignments = await assignPagesToGroups(
      pdfBuffer, pdfDoc, totalPages, sortedConfigs, supabase, attachment.base64
    );

    console.log(`Page assignments: ${pageAssignments.length} pages assigned across groups`);

    let overallSuccess = true;
    let lastExtLogId: string | null = null;

    let pageIndex = 0;
    for (const assignment of pageAssignments) {
      const { groupConfig, base64: pageBase64 } = assignment;
      const groupWorkflowVersion = groupConfig.workflow_version || transformationType.workflow_version || 'v1';
      const groupWorkflowId = groupWorkflowVersion === 'v2'
        ? (groupConfig.workflow_v2_id || transformationType.workflow_v2_id)
        : (groupConfig.workflow_id || transformationType.workflow_id);

      console.log(`Processing page ${pageIndex + 1}: Group ${groupConfig.group_order} (${groupConfig.name || 'unnamed'}), workflow ${groupWorkflowVersion}, ID: ${groupWorkflowId || 'none'}`);

      extractionLogId = await logger.createExtractionLog(null, attachment.filename);
      lastExtLogId = extractionLogId;

      await supabase
        .from('extraction_logs')
        .update({ processing_mode: 'transformation', transformation_type_id: transformationType.id })
        .eq('id', extractionLogId);

      let fieldMappings: any[] = [];
      const rawMappings = groupConfig.field_mappings || transformationType.field_mappings;
      if (rawMappings) {
        try {
          fieldMappings = typeof rawMappings === 'string' ? JSON.parse(rawMappings) : rawMappings;
        } catch {
          console.warn('Failed to parse field_mappings for group', groupConfig.group_order);
        }
      }

      const filenameTemplate = groupConfig.filename_template || transformationType.filename_template;

      const transformerResp = await fetchWithRetry(
        `${supabaseUrl}/functions/v1/pdf-transformer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pdfBase64: pageBase64,
            transformationType: {
              id: transformationType.id,
              name: transformationType.name,
              defaultInstructions: transformationType.default_instructions,
              filenameTemplate,
              fieldMappings
            },
            sessionId,
            groupOrder: groupConfig.group_order,
            pageIndex
          })
        },
        `pdf-transformer group ${groupConfig.group_order} page ${pageIndex + 1}`
      );

      if (!transformerResp.ok) {
        const errText = await transformerResp.text();
        const msg = `pdf-transformer failed for group ${groupConfig.group_order} page ${pageIndex + 1}: ${transformerResp.status} - ${errText}`;
        console.error(msg);
        if (extractionLogId) {
          await logger.updateExtractionLog(extractionLogId, {
            extraction_status: 'failed',
            error_message: msg
          });
        }
        overallSuccess = false;
        pageIndex++;
        continue;
      }

      const transformerResult = await transformerResp.json();
      const extractedRenameData = transformerResult.extractedData || {};
      const newFilename = transformerResult.newFilename || attachment.filename;
      console.log(`Group ${groupConfig.group_order} page ${pageIndex + 1} - new filename: ${newFilename}`);

      if (groupWorkflowId) {
        const processorEndpoint = groupWorkflowVersion === 'v2'
          ? 'transform-workflow-processor-v2'
          : 'transform-workflow-processor';

        const payload: Record<string, any> = {
          workflowId: groupWorkflowId,
          userId: null,
          transformationTypeId: transformationType.id,
          extractionLogId,
          pdfFilename: newFilename,
          originalPdfFilename: attachment.filename,
          pdfBase64: pageBase64,
          pdfPages: 1,
          extractedData: extractedRenameData,
          extractionTypeFilename: transformationType.filename_template,
          pageGroupFilenameTemplate: groupConfig.filename_template,
          senderEmail: fromEmail,
          triggerSource: 'email_monitoring',
          formatType: 'JSON',
          sessionId,
          groupOrder: groupConfig.group_order,
          pageIndex,
        };

        if (groupWorkflowVersion === 'v2') {
          payload.processingMode = 'transformation';
          payload.contextData = {
            emailSubject: subject,
            emailFrom: fromEmail,
            senderEmail: fromEmail,
          };
        }

        const resp = await fetch(`${supabaseUrl}/functions/v1/${processorEndpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await resp.json();
        console.log(`Group ${groupConfig.group_order} page ${pageIndex + 1} workflow result:`, { success: result.success, error: result.error });

        await logger.updateExtractionLog(extractionLogId, {
          extracted_data: JSON.stringify(extractedRenameData),
          extraction_status: result.success ? 'success' : 'failed',
          error_message: result.error || null
        });

        if (!result.success) {
          overallSuccess = false;
          console.error(`Workflow failed for group ${groupConfig.group_order} page ${pageIndex + 1}: ${result.error}`);
        }
      } else {
        if (!sftpConfig) {
          throw new Error('SFTP configuration required for direct transformation upload');
        }

        const resp = await fetch(`${supabaseUrl}/functions/v1/sftp-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sftpConfig,
            base64Data: pageBase64,
            originalFilename: attachment.filename,
            extractionTypeFilename: filenameTemplate,
            extractionTypeId: transformationType.id,
            xmlData: null,
            parseitId: null
          })
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`SFTP upload failed: ${resp.status} - ${errText}`);
        }

        await logger.updateExtractionLog(extractionLogId, {
          extracted_data: JSON.stringify(extractedRenameData),
          extraction_status: 'success'
        });
      }

      pageIndex++;
    }

    console.log(`=== PAGE GROUP PROCESSING COMPLETE (session: ${sessionId}) ===`);
    return { success: overallSuccess, extractionLogId: lastExtLogId, parseitId: null };

  } catch (processError) {
    console.error('Error processing attachment with page groups:', processError);

    if (extractionLogId) {
      await logger.updateExtractionLog(extractionLogId, {
        extraction_status: 'failed',
        error_message: (processError as Error).message
      });
    }

    return {
      success: false,
      extractionLogId,
      parseitId: null,
      error: (processError as Error).message
    };
  }
}


async function assignPagesToGroups(
  pdfBuffer: Uint8Array | Buffer,
  pdfDoc: PDFDocument,
  totalPages: number,
  sortedConfigs: PageGroupConfig[],
  supabase: any,
  fullPdfBase64: string
): Promise<PageGroupAssignment[]> {
  const isFixedSequence = sortedConfigs.some(cfg => cfg.detection_mode === 'fixed_sequence');
  const configsWithDetection = sortedConfigs.filter(
    cfg => cfg.smart_detection_pattern && cfg.smart_detection_pattern.trim()
  );

  if (isFixedSequence || configsWithDetection.length === 0) {
    console.log('Using sequential fixed-position page group assignment');
    return assignPagesSequential(pdfBuffer, pdfDoc, totalPages, sortedConfigs);
  }

  const hasFollowGroups = sortedConfigs.some(cfg => cfg.follows_previous_group);
  if (hasFollowGroups) {
    console.log('Using sequential detection with followsPreviousGroup');
    return assignPagesSequentialDetection(pdfBuffer, pdfDoc, totalPages, sortedConfigs, supabase, fullPdfBase64);
  }

  console.log('Using per-page independent detection');
  return assignPagesPerPageDetection(pdfBuffer, pdfDoc, totalPages, sortedConfigs, supabase, fullPdfBase64);
}

async function assignPagesSequential(
  pdfBuffer: Uint8Array | Buffer,
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
        const pageBase64 = await extractSinglePageBase64(pdfDoc, currentPage);
        assignments.push({
          pageIndex: currentPage,
          groupConfig,
          base64: pageBase64,
        });
        console.log(`Page ${currentPage + 1} -> Group ${groupConfig.group_order} (sequential)`);
        currentPage++;
      }
    }
  }

  return assignments;
}

async function assignPagesSequentialDetection(
  pdfBuffer: Uint8Array | Buffer,
  pdfDoc: PDFDocument,
  totalPages: number,
  sortedConfigs: PageGroupConfig[],
  supabase: any,
  fullPdfBase64: string
): Promise<PageGroupAssignment[]> {
  const leadConfig = sortedConfigs.find(cfg => !cfg.follows_previous_group && cfg.smart_detection_pattern?.trim());
  if (!leadConfig) {
    console.log('No lead detection config found, falling back to sequential');
    return assignPagesSequential(pdfBuffer, pdfDoc, totalPages, sortedConfigs);
  }

  const nonLeadConfigs = sortedConfigs.filter(cfg => cfg.group_order !== leadConfig.group_order);
  const allFollowersAreDependents = nonLeadConfigs.length > 0 && nonLeadConfigs.every(cfg => cfg.follows_previous_group);
  const isSimpleRepeatingPattern = allFollowersAreDependents;

  const groupPages: Map<number, number[]> = new Map();
  for (const config of sortedConfigs) {
    groupPages.set(config.group_order, []);
  }

  if (isSimpleRepeatingPattern) {
    console.log('Simple repeating pattern detected (1 lead + all followers). Using round-robin assignment.');
    let pageIdx = 0;
    while (pageIdx < totalPages) {
      const leadCount = leadConfig.process_mode === 'single' ? 1 : leadConfig.pages_per_group;
      for (let i = 0; i < leadCount && pageIdx < totalPages; i++) {
        groupPages.get(leadConfig.group_order)!.push(pageIdx);
        pageIdx++;
      }

      for (const followerConfig of sortedConfigs) {
        if (!followerConfig.follows_previous_group || pageIdx >= totalPages) continue;
        const followerCount = followerConfig.process_mode === 'single' ? 1 : followerConfig.pages_per_group;
        for (let i = 0; i < followerCount && pageIdx < totalPages; i++) {
          groupPages.get(followerConfig.group_order)!.push(pageIdx);
          pageIdx++;
        }
      }
    }
  } else {
    const pageTexts = await extractTextFromAllPages(pdfBuffer, pdfDoc, totalPages, supabase, fullPdfBase64);
    let pageIdx = 0;
    while (pageIdx < totalPages) {
      const pageText = pageTexts[pageIdx] || '';
      const matched = await detectPageMatchesGroupConfig(pageText, leadConfig, supabase);

      if (matched) {
        const leadCount = leadConfig.process_mode === 'single' ? 1 : leadConfig.pages_per_group;
        for (let i = 0; i < leadCount && pageIdx < totalPages; i++) {
          groupPages.get(leadConfig.group_order)!.push(pageIdx);
          pageIdx++;
        }

        for (const followerConfig of sortedConfigs) {
          if (!followerConfig.follows_previous_group || pageIdx >= totalPages) continue;
          const followerCount = followerConfig.process_mode === 'single' ? 1 : followerConfig.pages_per_group;
          for (let i = 0; i < followerCount && pageIdx < totalPages; i++) {
            groupPages.get(followerConfig.group_order)!.push(pageIdx);
            pageIdx++;
          }
        }
      } else {
        console.log(`Page ${pageIdx + 1} -> No lead match, skipping`);
        pageIdx++;
      }
    }
  }

  const assignments: PageGroupAssignment[] = [];
  for (const groupConfig of sortedConfigs) {
    const pages = groupPages.get(groupConfig.group_order) || [];
    for (const pageIdx of pages) {
      const pageBase64 = await extractSinglePageBase64(pdfDoc, pageIdx);
      assignments.push({ pageIndex: pageIdx, groupConfig, base64: pageBase64 });
    }
  }

  assignments.sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    return a.groupConfig.group_order - b.groupConfig.group_order;
  });

  return assignments;
}

async function assignPagesPerPageDetection(
  pdfBuffer: Uint8Array | Buffer,
  pdfDoc: PDFDocument,
  totalPages: number,
  sortedConfigs: PageGroupConfig[],
  supabase: any,
  fullPdfBase64: string
): Promise<PageGroupAssignment[]> {
  const aiConfigs = sortedConfigs.filter(cfg => cfg.use_ai_detection && cfg.smart_detection_pattern?.trim());
  const textOnlyConfigs = sortedConfigs.filter(cfg => !cfg.use_ai_detection && cfg.smart_detection_pattern?.trim());

  const needsAI = aiConfigs.length > 0;
  let apiKey: string | null = null;
  let modelName = '';
  let genAI: any = null;
  let model: any = null;

  if (needsAI) {
    apiKey = await getActiveGeminiApiKey(supabase);
    if (!apiKey) {
      console.warn('No Gemini API key, falling back to text-only matching');
    } else {
      modelName = await getActiveModelName(supabase);
      genAI = new GoogleGenerativeAI(apiKey);
      model = genAI.getGenerativeModel({ model: modelName });
    }
  }

  const assignments: PageGroupAssignment[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageBase64 = await extractSinglePageBase64(pdfDoc, pageIdx);
    let bestMatch: { config: PageGroupConfig; confidence: number } | null = null;

    if (model && aiConfigs.length > 0) {
      try {
        const groupPatterns = aiConfigs.map((cfg, idx) =>
          `Pattern ${idx + 1} (group_order ${cfg.group_order}): ${cfg.smart_detection_pattern}`
        ).join('\n');

        const prompt = `You are a pattern detection AI analyzing a PDF page. Evaluate EACH pattern independently against this page and return a confidence score for each.

PATTERNS TO EVALUATE:
${groupPatterns}

INSTRUCTIONS:
1. Analyze the page content carefully
2. Evaluate EACH pattern INDEPENDENTLY - do not compare patterns against each other
3. For each pattern, determine if this page matches that specific pattern/description
4. The pattern may be a specific text string, a descriptive condition, or a structural indicator
5. Be flexible with matching - consider case variations, spacing differences, and semantic meaning
6. Provide a confidence score from 0.0 to 1.0 for EACH pattern:
   - 1.0 = Perfect match, pattern clearly present
   - 0.7-0.9 = Strong match, pattern very likely present
   - 0.4-0.6 = Possible match, some indicators present
   - 0.0-0.3 = Weak or no match

RESPOND WITH VALID JSON ONLY (no markdown, no code blocks):
{
  "results": [
    {"group_order": <number>, "confidence": <0.0 to 1.0>, "reasoning": "Brief explanation"}
  ]
}`;

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pageBase64
            }
          },
          prompt
        ]);

        const responseText = result.response.text();
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const patternResult of parsed.results) {
            const matchedConfig = aiConfigs.find(cfg => cfg.group_order === patternResult.group_order);
            if (matchedConfig) {
              const threshold = matchedConfig.detection_confidence_threshold || 0.7;
              if (patternResult.confidence >= threshold) {
                if (!bestMatch || patternResult.confidence > bestMatch.confidence) {
                  bestMatch = { config: matchedConfig, confidence: patternResult.confidence };
                }
              }
            }
            console.log(`Page ${pageIdx + 1} pattern eval: group=${patternResult.group_order}, confidence=${patternResult.confidence?.toFixed(2)}, threshold=${aiConfigs.find(c => c.group_order === patternResult.group_order)?.detection_confidence_threshold || 0.7}`);
          }
        }
      } catch (aiError) {
        console.error(`AI classification failed for page ${pageIdx + 1}:`, aiError);
      }
    }

    if (!bestMatch && textOnlyConfigs.length > 0) {
      const pageText = await extractSinglePageText(model, pageBase64);
      for (const groupConfig of textOnlyConfigs) {
        const patternLower = groupConfig.smart_detection_pattern!.toLowerCase();
        if (pageText.toLowerCase().includes(patternLower)) {
          if (!bestMatch || 0.9 > bestMatch.confidence) {
            bestMatch = { config: groupConfig, confidence: 0.9 };
          }
        }
      }
    }

    if (bestMatch) {
      assignments.push({ pageIndex: pageIdx, groupConfig: bestMatch.config, base64: pageBase64 });
      console.log(`Page ${pageIdx + 1} -> Group ${bestMatch.config.group_order} (confidence: ${bestMatch.confidence.toFixed(2)})`);
    } else {
      console.log(`Page ${pageIdx + 1} -> No group matched, skipping`);
    }
  }

  return assignments;
}

async function extractSinglePageText(model: any, pageBase64: string): Promise<string> {
  if (!model) return '';
  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pageBase64
        }
      },
      'Extract ALL text content from this single PDF page. Return only the raw text, preserving the reading order. No commentary, no formatting, no markdown.'
    ]);
    return result.response.text().trim();
  } catch {
    return '';
  }
}

async function detectPageMatchesGroupConfig(
  pageText: string,
  groupConfig: PageGroupConfig,
  supabase: any
): Promise<boolean> {
  if (!groupConfig.smart_detection_pattern || !groupConfig.smart_detection_pattern.trim()) {
    return false;
  }

  const useAI = groupConfig.use_ai_detection;
  const confidenceThreshold = groupConfig.detection_confidence_threshold || 0.7;

  if (useAI) {
    try {
      const aiResult = await detectWithAI(pageText, groupConfig.smart_detection_pattern, confidenceThreshold, supabase);
      return aiResult.match && aiResult.confidence >= confidenceThreshold;
    } catch (aiError) {
      console.error('AI detection failed, falling back to text match:', aiError);
      const patternLower = groupConfig.smart_detection_pattern.toLowerCase();
      return pageText.toLowerCase().includes(patternLower);
    }
  } else {
    const patternLower = groupConfig.smart_detection_pattern.toLowerCase();
    return pageText.toLowerCase().includes(patternLower);
  }
}

async function detectWithAI(
  pageText: string,
  pattern: string,
  confidenceThreshold: number,
  supabase: any
): Promise<{ match: boolean; confidence: number }> {
  const apiKey = await getActiveGeminiApiKey(supabase);
  if (!apiKey) {
    throw new Error('No active Gemini API key configured');
  }
  const modelName = await getActiveModelName(supabase);

  const prompt = `You are a pattern detection AI analyzing PDF text content. Your task is to determine if the provided text matches a given pattern or description.

PATTERN TO DETECT:
${pattern}

PAGE TEXT CONTENT:
${pageText}

INSTRUCTIONS:
1. Analyze the page text to determine if it matches the pattern description
2. The pattern may be:
   - A specific text string to find
   - A descriptive condition
   - A structural indicator
3. Be flexible with matching - consider:
   - Case variations (upper/lower case)
   - Minor spacing or formatting differences
   - Semantic meaning rather than exact text matching
4. Provide a confidence score from 0.0 to 1.0

RESPOND WITH VALID JSON ONLY (no markdown, no code blocks):
{
  "match": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation"
}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const finalMatch = parsed.confidence >= confidenceThreshold;
  console.log(`AI detection: match=${finalMatch}, confidence=${parsed.confidence?.toFixed(2)}, pattern="${pattern.substring(0, 50)}..."`);

  return { match: finalMatch, confidence: parsed.confidence || 0 };
}

async function extractTextFromAllPages(
  pdfBuffer: Uint8Array | Buffer,
  pdfDoc: PDFDocument,
  totalPages: number,
  supabase: any,
  fullPdfBase64: string
): Promise<string[]> {
  const apiKey = await getActiveGeminiApiKey(supabase);
  if (!apiKey) {
    console.warn('No Gemini API key for text extraction, returning empty texts');
    return new Array(totalPages).fill('');
  }
  const modelName = await getActiveModelName(supabase);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const pageTexts: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    try {
      const pageBase64 = await extractSinglePageBase64(pdfDoc, pageIdx);

      const prompt = `Extract ALL text content from this single PDF page. Return only the raw text, preserving the reading order. Do not add any commentary, formatting, or markdown. Just the plain text as it appears on the page.`;

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pageBase64
          }
        },
        prompt
      ]);

      const text = result.response.text().trim();
      pageTexts.push(text);
      console.log(`Extracted text from page ${pageIdx + 1} (${text.length} chars)`);
    } catch (error) {
      console.error(`Error extracting text from page ${pageIdx + 1}:`, error);
      pageTexts.push('');
    }
  }

  return pageTexts;
}

async function extractSinglePageBase64(pdfDoc: PDFDocument, pageIndex: number): Promise<string> {
  const singlePageDoc = await PDFDocument.create();
  const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageIndex]);
  singlePageDoc.addPage(copiedPage);
  const pdfBytes = await singlePageDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

async function processTransformAttachment(
  attachment: PdfAttachment,
  transformationType: TransformationType,
  sftpConfig: SftpConfig | null,
  supabase: any,
  logger: LoggingService,
  fromEmail: string,
  subject: string,
): Promise<AttachmentProcessResult> {
  let extractionLogId: string | null = null;

  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseServiceKey = getSupabaseServiceKey();

    extractionLogId = await logger.createExtractionLog(null, attachment.filename);

    await supabase
      .from('extraction_logs')
      .update({ processing_mode: 'transformation', transformation_type_id: transformationType.id })
      .eq('id', extractionLogId);

    let fieldMappings: any[] = [];
    if (transformationType.field_mappings) {
      try {
        fieldMappings = typeof transformationType.field_mappings === 'string'
          ? JSON.parse(transformationType.field_mappings)
          : transformationType.field_mappings;
      } catch {
        console.warn('Failed to parse transformation field_mappings');
      }
    }

    console.log('Calling pdf-transformer for rename data extraction');
    const transformerResp = await fetch(`${supabaseUrl}/functions/v1/pdf-transformer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pdfBase64: attachment.base64,
        transformationType: {
          id: transformationType.id,
          name: transformationType.name,
          defaultInstructions: transformationType.default_instructions,
          filenameTemplate: transformationType.filename_template,
          fieldMappings
        }
      })
    });

    if (!transformerResp.ok) {
      const errText = await transformerResp.text();
      throw new Error(`pdf-transformer failed: ${transformerResp.status} - ${errText}`);
    }

    const transformerResult = await transformerResp.json();
    const extractedRenameData = transformerResult.extractedData || {};
    const newFilename = transformerResult.newFilename || attachment.filename;
    console.log('Transform result - new filename:', newFilename, 'extracted fields:', Object.keys(extractedRenameData));

    const workflowVersion = transformationType.workflow_version || 'v1';
    const workflowId = workflowVersion === 'v2' ? transformationType.workflow_v2_id : transformationType.workflow_id;

    if (workflowId) {
      const processorEndpoint = workflowVersion === 'v2'
        ? 'transform-workflow-processor-v2'
        : 'transform-workflow-processor';

      console.log(`Executing ${workflowVersion} transform workflow:`, workflowId, 'via', processorEndpoint);

      const payload: Record<string, any> = {
        workflowId,
        userId: null,
        transformationTypeId: transformationType.id,
        extractionLogId,
        pdfFilename: newFilename,
        originalPdfFilename: attachment.filename,
        pdfBase64: attachment.base64,
        pdfPages: attachment.pageCount || 1,
        extractedData: extractedRenameData,
        extractionTypeFilename: transformationType.filename_template,
        senderEmail: fromEmail,
        triggerSource: 'email_monitoring',
        formatType: 'JSON',
      };

      if (workflowVersion === 'v2') {
        payload.processingMode = 'transformation';
        payload.contextData = {
          emailSubject: subject,
          emailFrom: fromEmail,
          senderEmail: fromEmail,
        };
      }

      const resp = await fetch(`${supabaseUrl}/functions/v1/${processorEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await resp.json();
      console.log('Transform workflow result:', { success: result.success, error: result.error });

      await logger.updateExtractionLog(extractionLogId, {
        extracted_data: JSON.stringify(extractedRenameData),
        extraction_status: result.success ? 'success' : 'failed',
        error_message: result.error || null
      });

      if (!result.success) {
        throw new Error(result.error || 'Transform workflow execution failed');
      }
    } else {
      console.log('No workflow assigned to transformation type, uploading directly via SFTP');

      if (!sftpConfig) {
        throw new Error('SFTP configuration required for direct transformation upload');
      }

      const resp = await fetch(`${supabaseUrl}/functions/v1/sftp-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sftpConfig,
          base64Data: attachment.base64,
          originalFilename: attachment.filename,
          extractionTypeFilename: transformationType.filename_template,
          extractionTypeId: transformationType.id,
          xmlData: null,
          parseitId: null
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`SFTP upload failed: ${resp.status} - ${errText}`);
      }

      await logger.updateExtractionLog(extractionLogId, {
        extracted_data: JSON.stringify(extractedRenameData),
        extraction_status: 'success'
      });
    }

    return { success: true, extractionLogId, parseitId: null };

  } catch (processError) {
    console.error('Error processing transform attachment:', processError);

    if (extractionLogId) {
      await logger.updateExtractionLog(extractionLogId, {
        extraction_status: 'failed',
        error_message: (processError as Error).message
      });
    }

    return {
      success: false,
      extractionLogId,
      parseitId: null,
      error: (processError as Error).message
    };
  }
}

async function splitPdfAttachmentIntoPages(attachment: PdfAttachment): Promise<PdfAttachment[]> {
  const pdfBuffer = Buffer.from(attachment.base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  const baseFilename = attachment.filename.replace(/\.pdf$/i, '');
  const results: PdfAttachment[] = [];

  for (let i = 0; i < totalPages; i++) {
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
    singlePageDoc.addPage(copiedPage);
    const pdfBytes = await singlePageDoc.save();
    const base64Data = Buffer.from(pdfBytes).toString('base64');

    results.push({
      filename: `${baseFilename}_page_${i + 1}.pdf`,
      base64: base64Data,
      pageCount: 1,
    });
  }

  return results;
}

function buildResult(
  id: string,
  from: string,
  subject: string,
  receivedDate: string,
  processedSuccessfully: boolean,
  errorMessage: string | null,
  extractionLogId: string | null,
  attachments: PdfAttachment[],
  matchingRule: ProcessingRule | null
): ProcessEmailResult {
  return {
    emailResult: {
      id,
      from,
      subject,
      receivedDate,
      processedSuccessfully,
      errorMessage,
      extractionLogId,
      rule: matchingRule ? (matchingRule.rule_name || matchingRule.id || 'Matched (unnamed rule)') : 'No rule matched'
    },
    attachments,
    matchingRule,
    parseitId: null
  };
}
