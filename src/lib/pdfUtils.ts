import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextFromPdfPages } from './pdfTextExtractor';
import { detectPatternWithAI, detectPatternWithAIImage, isTextSufficientForDetection } from './aiSmartDetection';
import { withRetry } from './retryHelper';
import type { PageGroupConfig, ManualGroupEdit } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

async function renderPdfPageToBase64(pdfFile: File, pageNumber: number): Promise<string> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get canvas context');
  }

  await page.render({ canvasContext: context, viewport }).promise;

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

export interface PdfSplittingOptions {
  pagesPerGroup?: number;
  documentStartPattern?: string;
  documentStartDetectionEnabled?: boolean;
}

export interface PageGroupSplittingOptions {
  pageGroupConfigs?: PageGroupConfig[];
  apiKey?: string;
}

export async function splitPdfIntoLogicalDocuments(
  originalPdfFile: File,
  options: PdfSplittingOptions = {}
): Promise<File[]> {
  const {
    pagesPerGroup = 1,
    documentStartPattern,
    documentStartDetectionEnabled = false
  } = options;

  console.log('🔧 === PDF SPLITTING UTILITY START ===');
  console.log('📄 Original PDF file:', originalPdfFile.name);
  console.log('📊 Splitting options received:', {
    pagesPerGroup,
    documentStartPattern,
    documentStartDetectionEnabled
  });

  try {
    // Load the original PDF
    const arrayBuffer = await originalPdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();

    console.log(`📄 PDF has ${totalPages} pages, splitting with options:`, options);
    console.log(`📊 Expected groups with ${pagesPerGroup} pages per group:`, Math.ceil(totalPages / pagesPerGroup));

    let documentBoundaries: number[] = [];

    // Phase 1: Determine document boundaries
    if (documentStartDetectionEnabled && documentStartPattern && documentStartPattern.trim()) {
      console.log('Using pattern-based document detection:', documentStartPattern);
      
      try {
        // Extract text from all pages
        const pageTexts = await extractTextFromPdfPages(originalPdfFile);
        console.log('Extracted text from', pageTexts.length, 'pages');

        // Find pages that contain the start pattern
        const startPageIndices: number[] = [];
        pageTexts.forEach((pageText, index) => {
          if (pageText.toLowerCase().includes(documentStartPattern.toLowerCase())) {
            startPageIndices.push(index); // 0-based index
            console.log(`Found start pattern on page ${index + 1}: "${documentStartPattern}"`);
          }
        });

        if (startPageIndices.length > 0) {
          console.log('Pattern detection found', startPageIndices.length, 'document starts at pages:', startPageIndices.map(i => i + 1));
          
          // Create document boundaries based on detected starts
          for (let i = 0; i < startPageIndices.length; i++) {
            const startPage = startPageIndices[i];
            let endPage: number;
            
            if (i < startPageIndices.length - 1) {
              // Not the last document - end before next start, but respect pagesPerGroup limit
              const nextStart = startPageIndices[i + 1];
              const maxEndByGroup = startPage + pagesPerGroup - 1;
              endPage = Math.min(nextStart - 1, maxEndByGroup);
            } else {
              // Last document - end at pagesPerGroup limit or end of PDF
              endPage = Math.min(startPage + pagesPerGroup - 1, totalPages - 1);
            }
            
            documentBoundaries.push(startPage, endPage);
            console.log(`Document ${i + 1}: pages ${startPage + 1} to ${endPage + 1}`);
          }
        } else {
          console.log('No start pattern found, falling back to fixed grouping');
          // Fall back to fixed grouping if no pattern found
          documentBoundaries = createFixedGroupBoundaries(totalPages, pagesPerGroup);
        }
      } catch (textExtractionError) {
        console.error('Text extraction failed, falling back to fixed grouping:', textExtractionError);
        // Fall back to fixed grouping if text extraction fails
        documentBoundaries = createFixedGroupBoundaries(totalPages, pagesPerGroup);
      }
    } else {
      console.log('Using fixed page grouping:', pagesPerGroup);
      // Use fixed grouping
      documentBoundaries = createFixedGroupBoundaries(totalPages, pagesPerGroup);
    }

    // Phase 2: Create logical document files based on boundaries
    const logicalDocuments: File[] = [];
    
    for (let i = 0; i < documentBoundaries.length; i += 2) {
      const startPage = documentBoundaries[i];
      const endPage = documentBoundaries[i + 1];
      
      console.log(`Creating logical document from pages ${startPage + 1} to ${endPage + 1}`);
      
      // Create a new PDF document for this logical group
      const groupDoc = await PDFDocument.create();
      const pagesToCopy = [];
      
      for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
        pagesToCopy.push(pageIndex);
      }
      
      const copiedPages = await groupDoc.copyPages(pdfDoc, pagesToCopy);
      copiedPages.forEach(page => groupDoc.addPage(page));
      
      // Convert to File object
      const groupPdfBytes = await groupDoc.save();
      const groupFileName = `${originalPdfFile.name.replace('.pdf', '')}_group_${Math.floor(i / 2) + 1}_pages_${startPage + 1}-${endPage + 1}.pdf`;
      const groupFile = new File([groupPdfBytes], groupFileName, {
        type: 'application/pdf'
      });
      
      logicalDocuments.push(groupFile);
    }

    console.log(`Created ${logicalDocuments.length} logical documents`);
    return logicalDocuments;

  } catch (error) {
    console.error('Error splitting PDF into logical documents:', error);
    throw new Error(`Failed to split PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function createFixedGroupBoundaries(totalPages: number, pagesPerGroup: number): number[] {
  const boundaries: number[] = [];

  for (let startPage = 0; startPage < totalPages; startPage += pagesPerGroup) {
    const endPage = Math.min(startPage + pagesPerGroup - 1, totalPages - 1);
    boundaries.push(startPage, endPage);
  }

  return boundaries;
}

export interface PageGroupResult {
  file: File;
  pageGroupConfig: PageGroupConfig;
  startPage: number;
  endPage: number;
  detectionMethod: 'smart' | 'fixed';
  originalPdfPageStart: number;
  originalPdfPageEnd: number;
  assignedPages?: number[];
}

export async function splitPdfWithPageGroups(
  originalPdfFile: File,
  pageGroupConfigs: PageGroupConfig[],
  apiKey?: string
): Promise<PageGroupResult[]> {
  console.log('=== PDF PAGE GROUP SPLITTING START ===');
  console.log('Original PDF file:', originalPdfFile.name);
  console.log('Page group configs:', pageGroupConfigs.length);

  try {
    const arrayBuffer = await originalPdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();

    console.log(`PDF has ${totalPages} pages`);

    const pageTexts = await extractTextFromPdfPages(originalPdfFile);
    console.log('Extracted text from', pageTexts.length, 'pages');

    const sortedConfigs = pageGroupConfigs.sort((a, b) => a.groupOrder - b.groupOrder);

    const isFixedSequence = sortedConfigs.some(cfg => cfg.detectionMode === 'fixed_sequence');
    if (isFixedSequence) {
      console.log('Fixed sequence mode enabled, skipping all detection');
      return splitPdfWithPageGroupsSequential(
        originalPdfFile, pdfDoc, totalPages, pageTexts, sortedConfigs
      );
    }

    const configsWithDetection = sortedConfigs.filter(
      cfg => cfg.smartDetectionPattern && cfg.smartDetectionPattern.trim()
    );

    if (configsWithDetection.length === 0) {
      return splitPdfWithPageGroupsSequential(
        originalPdfFile, pdfDoc, totalPages, pageTexts, sortedConfigs
      );
    }

    const hasFollowGroups = sortedConfigs.some(cfg => cfg.followsPreviousGroup);

    if (hasFollowGroups) {
      return splitPdfWithSequentialDetection(
        originalPdfFile, pdfDoc, totalPages, pageTexts, sortedConfigs, apiKey
      );
    }

    return splitPdfWithPerPageDetection(
      originalPdfFile, pdfDoc, totalPages, pageTexts, sortedConfigs, apiKey
    );

  } catch (error) {
    console.error('Error splitting PDF with page groups:', error);
    throw new Error(`Failed to split PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function detectPageMatchesGroup(
  pageText: string,
  pageIdx: number,
  groupConfig: PageGroupConfig,
  originalPdfFile: File,
  apiKey?: string
): Promise<boolean> {
  if (!groupConfig.smartDetectionPattern || !groupConfig.smartDetectionPattern.trim()) {
    return false;
  }

  const useAI = groupConfig.useAiDetection;
  const confidenceThreshold = groupConfig.detectionConfidenceThreshold || 0.7;

  if (useAI) {
    const hasEnoughText = isTextSufficientForDetection(pageText);
    try {
      let aiResult;
      if (hasEnoughText) {
        console.log(`Page ${pageIdx + 1}: AI text detection for group ${groupConfig.groupOrder}`);
        aiResult = await withRetry(
          () => detectPatternWithAI({
            pageText,
            pattern: groupConfig.smartDetectionPattern,
            confidenceThreshold,
            apiKey: apiKey!
          }),
          `AI text detection page ${pageIdx + 1} group ${groupConfig.groupOrder}`
        );
      } else {
        console.log(`Page ${pageIdx + 1}: AI image detection for group ${groupConfig.groupOrder}`);
        const imageBase64 = await renderPdfPageToBase64(originalPdfFile, pageIdx + 1);
        aiResult = await withRetry(
          () => detectPatternWithAIImage({
            imageBase64,
            pattern: groupConfig.smartDetectionPattern,
            confidenceThreshold,
            apiKey: apiKey!
          }),
          `AI image detection page ${pageIdx + 1} group ${groupConfig.groupOrder}`
        );
      }
      console.log(`Page ${pageIdx + 1} group ${groupConfig.groupOrder}: match=${aiResult.match}, confidence=${aiResult.confidence.toFixed(2)}`);
      return aiResult.match && aiResult.confidence >= confidenceThreshold;
    } catch (aiError) {
      console.error(`AI detection failed page ${pageIdx + 1} group ${groupConfig.groupOrder}:`, aiError);
      const patternLower = groupConfig.smartDetectionPattern.toLowerCase();
      return pageText.toLowerCase().includes(patternLower);
    }
  } else {
    const patternLower = groupConfig.smartDetectionPattern.toLowerCase();
    return pageText.toLowerCase().includes(patternLower);
  }
}

async function splitPdfWithSequentialDetection(
  originalPdfFile: File,
  pdfDoc: PDFDocument,
  totalPages: number,
  pageTexts: string[],
  sortedConfigs: PageGroupConfig[],
  apiKey?: string
): Promise<PageGroupResult[]> {
  console.log('Using sequential detection with followsPreviousGroup support');

  const leadConfig = sortedConfigs.find(cfg => !cfg.followsPreviousGroup && cfg.smartDetectionPattern?.trim());
  if (!leadConfig) {
    console.log('No lead detection config found, falling back to sequential fixed-position');
    return splitPdfWithPageGroupsSequential(originalPdfFile, pdfDoc, totalPages, pageTexts, sortedConfigs);
  }

  const nonLeadConfigs = sortedConfigs.filter(cfg => cfg.groupOrder !== leadConfig.groupOrder);
  const allFollowersAreDependents = nonLeadConfigs.length > 0 && nonLeadConfigs.every(cfg => cfg.followsPreviousGroup);
  const leadConfigs = sortedConfigs.filter(cfg => !cfg.followsPreviousGroup && cfg.smartDetectionPattern?.trim());
  const isSimpleRepeatingPattern = leadConfigs.length === 1 && allFollowersAreDependents;

  const groupPages: Map<number, number[]> = new Map();
  for (const config of sortedConfigs) {
    groupPages.set(config.groupOrder, []);
  }

  if (isSimpleRepeatingPattern) {
    console.log('Simple repeating pattern detected (1 lead + all followers). Skipping AI, using round-robin assignment.');

    let pageIdx = 0;
    while (pageIdx < totalPages) {
      const leadCount = leadConfig.processMode === 'single' ? 1 : leadConfig.pagesPerGroup;
      const leadPages = [];
      for (let i = 0; i < leadCount && (pageIdx + i) < totalPages; i++) {
        leadPages.push(pageIdx + i);
      }
      console.log(`Page ${leadPages.map(p => p + 1).join(', ')} -> Group ${leadConfig.groupOrder} (lead, round-robin)`);
      groupPages.get(leadConfig.groupOrder)!.push(...leadPages);
      pageIdx += leadPages.length;

      for (const followerConfig of sortedConfigs) {
        if (!followerConfig.followsPreviousGroup || pageIdx >= totalPages) continue;
        const followerCount = followerConfig.processMode === 'single' ? 1 : followerConfig.pagesPerGroup;
        const followerPages = [];
        for (let i = 0; i < followerCount && (pageIdx + i) < totalPages; i++) {
          followerPages.push(pageIdx + i);
        }
        console.log(`Page ${followerPages.map(p => p + 1).join(', ')} -> Group ${followerConfig.groupOrder} (follower, round-robin)`);
        groupPages.get(followerConfig.groupOrder)!.push(...followerPages);
        pageIdx += followerPages.length;
      }
    }
  } else {
    let pageIdx = 0;
    while (pageIdx < totalPages) {
      const pageText = pageTexts[pageIdx];
      const matched = await detectPageMatchesGroup(pageText, pageIdx, leadConfig, originalPdfFile, apiKey);

      if (matched) {
        console.log(`Page ${pageIdx + 1} -> Group ${leadConfig.groupOrder} (detected lead)`);
        const leadPages = [];
        const leadCount = leadConfig.processMode === 'single' ? 1 : leadConfig.pagesPerGroup;
        for (let i = 0; i < leadCount && (pageIdx + i) < totalPages; i++) {
          leadPages.push(pageIdx + i);
        }
        groupPages.get(leadConfig.groupOrder)!.push(...leadPages);
        pageIdx += leadPages.length;

        for (const followerConfig of sortedConfigs) {
          if (!followerConfig.followsPreviousGroup || pageIdx >= totalPages) continue;
          const followerCount = followerConfig.processMode === 'single' ? 1 : followerConfig.pagesPerGroup;
          const followerPages = [];
          for (let i = 0; i < followerCount && (pageIdx + i) < totalPages; i++) {
            followerPages.push(pageIdx + i);
          }
          console.log(`Page ${followerPages.map(p => p + 1).join(', ')} -> Group ${followerConfig.groupOrder} (follows previous)`);
          groupPages.get(followerConfig.groupOrder)!.push(...followerPages);
          pageIdx += followerPages.length;
        }
      } else {
        console.log(`Page ${pageIdx + 1} -> No group matched, skipping`);
        pageIdx++;
      }
    }
  }

  const results: PageGroupResult[] = [];
  for (const groupConfig of sortedConfigs) {
    const pages = groupPages.get(groupConfig.groupOrder) || [];
    if (pages.length === 0) {
      console.log(`Group ${groupConfig.groupOrder}: No pages assigned, skipping`);
      continue;
    }

    console.log(`Group ${groupConfig.groupOrder}: Pages ${pages.map(p => p + 1).join(', ')}`);

    const groupDoc = await PDFDocument.create();
    const copiedPages = await groupDoc.copyPages(pdfDoc, pages);
    copiedPages.forEach(page => groupDoc.addPage(page));

    const groupPdfBytes = await groupDoc.save();
    const pagesStr = pages.map(p => p + 1).join(',');
    const groupFileName = `${originalPdfFile.name.replace('.pdf', '')}_group_${groupConfig.groupOrder}_pages_${pagesStr}.pdf`;
    const groupFile = new File([groupPdfBytes], groupFileName, { type: 'application/pdf' });

    const startPage = Math.min(...pages);
    const endPage = Math.max(...pages);

    results.push({
      file: groupFile,
      pageGroupConfig: groupConfig,
      startPage,
      endPage,
      detectionMethod: groupConfig.followsPreviousGroup ? 'fixed' : 'smart',
      originalPdfPageStart: startPage + 1,
      originalPdfPageEnd: endPage + 1,
      assignedPages: pages.map(p => p + 1)
    });
  }

  console.log(`\nCreated ${results.length} page groups from ${totalPages} pages`);
  results.forEach((result) => {
    const pages = result.assignedPages || [];
    console.log(`  Group ${result.pageGroupConfig.groupOrder}: Pages [${pages.join(', ')}], Method: ${result.detectionMethod}`);
  });

  return results;
}

async function splitPdfWithPerPageDetection(
  originalPdfFile: File,
  pdfDoc: PDFDocument,
  totalPages: number,
  pageTexts: string[],
  sortedConfigs: PageGroupConfig[],
  apiKey?: string
): Promise<PageGroupResult[]> {
  console.log('Using per-page independent detection (no followsPreviousGroup)');

  const pageAssignments: (PageGroupConfig | null)[] = new Array(totalPages).fill(null);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageText = pageTexts[pageIdx];
    let bestMatch: { config: PageGroupConfig; confidence: number } | null = null;

    for (const groupConfig of sortedConfigs) {
      if (!groupConfig.smartDetectionPattern || !groupConfig.smartDetectionPattern.trim()) {
        continue;
      }

      const useAI = groupConfig.useAiDetection;
      const confidenceThreshold = groupConfig.detectionConfidenceThreshold || 0.7;

      if (useAI) {
        const hasEnoughText = isTextSufficientForDetection(pageText);
        try {
          let aiResult;
          if (hasEnoughText) {
            console.log(`Page ${pageIdx + 1}: AI text detection for group ${groupConfig.groupOrder}`);
            aiResult = await withRetry(
              () => detectPatternWithAI({
                pageText,
                pattern: groupConfig.smartDetectionPattern,
                confidenceThreshold,
                apiKey: apiKey!
              }),
              `AI text detection page ${pageIdx + 1} group ${groupConfig.groupOrder}`
            );
          } else {
            console.log(`Page ${pageIdx + 1}: AI image detection for group ${groupConfig.groupOrder}`);
            const imageBase64 = await renderPdfPageToBase64(originalPdfFile, pageIdx + 1);
            aiResult = await withRetry(
              () => detectPatternWithAIImage({
                imageBase64,
                pattern: groupConfig.smartDetectionPattern,
                confidenceThreshold,
                apiKey: apiKey!
              }),
              `AI image detection page ${pageIdx + 1} group ${groupConfig.groupOrder}`
            );
          }
          console.log(`Page ${pageIdx + 1} group ${groupConfig.groupOrder}: match=${aiResult.match}, confidence=${aiResult.confidence.toFixed(2)}`);
          if (aiResult.match && aiResult.confidence >= confidenceThreshold) {
            if (!bestMatch || aiResult.confidence > bestMatch.confidence) {
              bestMatch = { config: groupConfig, confidence: aiResult.confidence };
            }
          }
        } catch (aiError) {
          console.error(`AI detection failed page ${pageIdx + 1} group ${groupConfig.groupOrder}:`, aiError);
          const patternLower = groupConfig.smartDetectionPattern.toLowerCase();
          if (pageText.toLowerCase().includes(patternLower)) {
            console.log(`Fallback text match page ${pageIdx + 1} group ${groupConfig.groupOrder}`);
            if (!bestMatch || 0.8 > bestMatch.confidence) {
              bestMatch = { config: groupConfig, confidence: 0.8 };
            }
          }
        }
      } else {
        const patternLower = groupConfig.smartDetectionPattern.toLowerCase();
        if (pageText.toLowerCase().includes(patternLower)) {
          console.log(`Text match page ${pageIdx + 1} group ${groupConfig.groupOrder}`);
          if (!bestMatch || 0.9 > bestMatch.confidence) {
            bestMatch = { config: groupConfig, confidence: 0.9 };
          }
        }
      }
    }

    if (bestMatch) {
      pageAssignments[pageIdx] = bestMatch.config;
      console.log(`Page ${pageIdx + 1} -> Group ${bestMatch.config.groupOrder} (confidence: ${bestMatch.confidence.toFixed(2)})`);
    } else {
      console.log(`Page ${pageIdx + 1} -> No group matched`);
    }
  }

  const groupPages: Map<number, number[]> = new Map();
  for (const config of sortedConfigs) {
    groupPages.set(config.groupOrder, []);
  }

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const assignedConfig = pageAssignments[pageIdx];
    if (assignedConfig) {
      groupPages.get(assignedConfig.groupOrder)!.push(pageIdx);
    }
  }

  const results: PageGroupResult[] = [];
  for (const groupConfig of sortedConfigs) {
    const pages = groupPages.get(groupConfig.groupOrder) || [];
    if (pages.length === 0) {
      console.log(`Group ${groupConfig.groupOrder}: No pages matched, skipping`);
      continue;
    }

    console.log(`Group ${groupConfig.groupOrder}: Pages ${pages.map(p => p + 1).join(', ')}`);

    const groupDoc = await PDFDocument.create();
    const copiedPages = await groupDoc.copyPages(pdfDoc, pages);
    copiedPages.forEach(page => groupDoc.addPage(page));

    const groupPdfBytes = await groupDoc.save();
    const pagesStr = pages.map(p => p + 1).join(',');
    const groupFileName = `${originalPdfFile.name.replace('.pdf', '')}_group_${groupConfig.groupOrder}_pages_${pagesStr}.pdf`;
    const groupFile = new File([groupPdfBytes], groupFileName, { type: 'application/pdf' });

    const startPage = Math.min(...pages);
    const endPage = Math.max(...pages);

    results.push({
      file: groupFile,
      pageGroupConfig: groupConfig,
      startPage,
      endPage,
      detectionMethod: 'smart',
      originalPdfPageStart: startPage + 1,
      originalPdfPageEnd: endPage + 1,
      assignedPages: pages.map(p => p + 1)
    });
  }

  console.log(`\nCreated ${results.length} page groups from ${totalPages} pages`);
  results.forEach((result) => {
    const pages = result.assignedPages || [];
    console.log(`  Group ${result.pageGroupConfig.groupOrder}: Pages [${pages.join(', ')}], Method: ${result.detectionMethod}`);
  });

  return results;
}

async function splitPdfWithPageGroupsSequential(
  originalPdfFile: File,
  pdfDoc: PDFDocument,
  totalPages: number,
  pageTexts: string[],
  sortedConfigs: PageGroupConfig[]
): Promise<PageGroupResult[]> {
  console.log('Using sequential fixed-position grouping (no smart detection patterns)');

  const results: PageGroupResult[] = [];
  let currentPage = 0;

  while (currentPage < totalPages) {
    for (const groupConfig of sortedConfigs) {
      if (currentPage >= totalPages) break;

      const startPage = currentPage;
      let endPage: number;

      if (groupConfig.processMode === 'single') {
        endPage = startPage;
      } else {
        endPage = Math.min(startPage + groupConfig.pagesPerGroup - 1, totalPages - 1);
      }

      const groupDoc = await PDFDocument.create();
      const pagesToCopy = [];
      for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
        pagesToCopy.push(pageIndex);
      }

      const copiedPages = await groupDoc.copyPages(pdfDoc, pagesToCopy);
      copiedPages.forEach(page => groupDoc.addPage(page));

      const groupPdfBytes = await groupDoc.save();
      const groupFileName = `${originalPdfFile.name.replace('.pdf', '')}_group_${groupConfig.groupOrder}_pages_${startPage + 1}-${endPage + 1}.pdf`;
      const groupFile = new File([groupPdfBytes], groupFileName, {
        type: 'application/pdf'
      });

      results.push({
        file: groupFile,
        pageGroupConfig: groupConfig,
        startPage,
        endPage,
        detectionMethod: 'fixed',
        originalPdfPageStart: startPage + 1,
        originalPdfPageEnd: endPage + 1
      });

      currentPage = endPage + 1;
    }
  }

  return results;
}

export async function splitPdfWithManualGroups(
  originalPdfFile: File,
  manualGroups: ManualGroupEdit[]
): Promise<PageGroupResult[]> {
  console.log('🔧 === PDF MANUAL GROUP SPLITTING START ===');
  console.log('📄 Original PDF file:', originalPdfFile.name);
  console.log('📊 Manual groups:', manualGroups.length);

  try {
    const arrayBuffer = await originalPdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();

    console.log(`📄 PDF has ${totalPages} pages`);

    const results: PageGroupResult[] = [];

    for (const manualGroup of manualGroups.sort((a, b) => a.groupOrder - b.groupOrder)) {
      if (manualGroup.pages.length === 0) {
        console.log(`⚠️ Skipping group ${manualGroup.groupOrder} - no pages assigned`);
        continue;
      }

      console.log(`\n=== Processing Manual Group ${manualGroup.groupOrder} ===`);
      console.log('Pages:', manualGroup.pages.join(', '));

      for (const pageNum of manualGroup.pages) {
        const pageIndex = pageNum - 1;
        if (pageIndex < 0 || pageIndex >= totalPages) {
          const errorMsg = `Invalid page number ${pageNum} in group ${manualGroup.groupOrder}. PDF only has ${totalPages} pages (valid range: 1-${totalPages}).`;
          console.error('❌ Page validation failed:', errorMsg);
          throw new Error(errorMsg);
        }
      }

      const startPage = Math.min(...manualGroup.pages) - 1;
      const endPage = Math.max(...manualGroup.pages) - 1;

      const groupDoc = await PDFDocument.create();
      const pagesToCopy = manualGroup.pages.map(p => p - 1);
      console.log(`📋 Copying page indices from PDF:`, pagesToCopy);

      const copiedPages = await groupDoc.copyPages(pdfDoc, pagesToCopy);
      copiedPages.forEach(page => groupDoc.addPage(page));

      const groupPdfBytes = await groupDoc.save();
      const pagesStr = manualGroup.pages.length === 1
        ? manualGroup.pages[0].toString()
        : `${Math.min(...manualGroup.pages)}-${Math.max(...manualGroup.pages)}`;
      const groupFileName = `${originalPdfFile.name.replace('.pdf', '')}_group_${manualGroup.groupOrder}_pages_${pagesStr}.pdf`;
      const groupFile = new File([groupPdfBytes], groupFileName, {
        type: 'application/pdf'
      });

      results.push({
        file: groupFile,
        pageGroupConfig: manualGroup.pageGroupConfig,
        startPage,
        endPage,
        detectionMethod: 'fixed',
        originalPdfPageStart: Math.min(...manualGroup.pages),
        originalPdfPageEnd: Math.max(...manualGroup.pages)
      });

      console.log(`✅ Group ${manualGroup.groupOrder} complete: ${groupFileName}`);
    }

    console.log(`\n✅ Created ${results.length} manual groups from ${totalPages} pages`);
    results.forEach((result, idx) => {
      console.log(`  Group ${idx + 1}: Pages ${result.originalPdfPageStart}-${result.originalPdfPageEnd}, Workflow: ${result.pageGroupConfig.workflowId || 'none'}`);
    });

    return results;

  } catch (error) {
    console.error('Error splitting PDF with manual groups:', error);
    throw new Error(`Failed to split PDF with manual groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}