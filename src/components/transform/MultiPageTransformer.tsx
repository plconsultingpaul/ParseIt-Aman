import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Loader2, CheckCircle, XCircle, Brain, FileText, Layers, Pencil as Edit3 } from 'lucide-react';
import PageTransformerCard from './PageTransformerCard';
import ManualGroupEditor from './ManualGroupEditor';
import type { TransformationType, SftpConfig, SettingsConfig, ApiConfig, User, WorkflowStep, PageGroupConfig, ManualGroupEdit } from '../../types';
import { detectExtractionType } from '../../lib/geminiDetector';
import type { DetectionResult } from '../../types';
import { supabase, getAuthHeaders } from '../../lib/supabase';
import { executeTransformWorkflowV2 } from '../../lib/workflowV2';
import { splitPdfWithManualGroups } from '../../lib/pdfUtils';

import { PDFDocument } from 'pdf-lib';
import { withRetry } from '../../lib/retryHelper';

interface MultiPageTransformerProps {
  pdfPages: File[];
  fallbackTransformationType: TransformationType;
  allTransformationTypes: TransformationType[];
  uploadMode: 'manual' | 'auto';
  additionalInstructions: string;
  sftpConfig: SftpConfig;
  settingsConfig: SettingsConfig;
  apiConfig: ApiConfig;
  user: User | null;
  workflowSteps: WorkflowStep[];
  pageGroupConfigs?: PageGroupConfig[];
  pageRangeInfo?: { totalPages: number; usedPages: number[]; unusedPages: number[] };
  originalPdfFile?: File | null;
}

interface PageTransformationInfo {
  pageIndex: number;
  transformationType: TransformationType;
  detectionResult?: DetectionResult;
  success: boolean;
  newFilename?: string;
  error?: string;
  completed: boolean;
  pageStart?: number;
  pageEnd?: number;
}
export interface MultiPageTransformerHandle {
  openManualEditor: () => void;
}

const MultiPageTransformer = forwardRef<MultiPageTransformerHandle, MultiPageTransformerProps>(function MultiPageTransformer({
  pdfPages,
  fallbackTransformationType,
  allTransformationTypes,
  uploadMode,
  additionalInstructions,
  sftpConfig,
  settingsConfig,
  apiConfig,
  user,
  workflowSteps,
  pageGroupConfigs,
  pageRangeInfo,
  originalPdfFile
}, ref) {
  const [isTransformingAll, setIsTransformingAll] = useState(false);
  const [currentProcessingPage, setCurrentProcessingPage] = useState<number | null>(null);
  const [pageProcessingResults, setPageProcessingResults] = useState<any[]>([]);
  const [transformAllResults, setTransformAllResults] = useState<PageTransformationInfo[]>([]);
  const [pageTransformationTypes, setPageTransformationTypes] = useState<Record<number, TransformationType>>({});
  const [isDetectingTypes, setIsDetectingTypes] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [manuallyEditedGroups, setManuallyEditedGroups] = useState<ManualGroupEdit[] | null>(null);
  const [manuallyEditedPdfPages, setManuallyEditedPdfPages] = useState<File[] | null>(null);

  useImperativeHandle(ref, () => ({
    openManualEditor: () => setShowManualEditor(true)
  }));

  // Initialize page processing results when pdfPages or currentTransformationType changes
  useEffect(() => {
    setPageProcessingResults(new Array(pdfPages.length).fill(null));
    setTransformAllResults([]);
    setPageTransformationTypes({});
  }, [pdfPages, fallbackTransformationType]);

  // Trigger page-level detection when component loads or key props change
  useEffect(() => {
    if (pdfPages.length > 0 && uploadMode === 'auto' && allTransformationTypes.length > 0) {
      console.log('🔍 Triggering page-level transformation type detection...');
      detectPageTransformationTypes();
    } else {
      console.log('🔍 Skipping page-level detection:', {
        pdfPagesLength: pdfPages.length,
        uploadMode,
        transformationTypesLength: allTransformationTypes.length
      });
      
      // For manual mode or when conditions aren't met, use fallback type for all pages
      const manualTypes: Record<number, TransformationType> = {};
      const manualResults: PageTransformationInfo[] = [];
      pdfPages.forEach((_, index) => {
        manualTypes[index] = fallbackTransformationType;
        manualResults[index] = {
          pageIndex: index,
          transformationType: fallbackTransformationType,
          success: false,
          completed: false
        };
      });
      setPageTransformationTypes(manualTypes);
      setTransformAllResults(manualResults);
    }
  }, [pdfPages, fallbackTransformationType, uploadMode, allTransformationTypes]);
  const handleProcessStart = (pageIndex: number) => {
    // No-op for now, state managed by individual cards
  };

  const handleProcessComplete = (pageIndex: number, result: any) => {
    setPageProcessingResults(prev => {
      const newResults = [...prev];
      newResults[pageIndex] = result;
      return newResults;
    });
  };

  const handleOpenManualEditor = () => {
    setShowManualEditor(true);
  };

  const handleCloseManualEditor = () => {
    setShowManualEditor(false);
  };

  const handleSaveManualEdits = async (editedGroups: ManualGroupEdit[]) => {
    console.log('📝 Applying manual group edits:', editedGroups);

    try {
      if (!pdfPages || pdfPages.length === 0) {
        console.error('No PDF pages available for manual editing');
        return;
      }

      // Use the original PDF file if available, otherwise reconstruct
      let pdfToSplit: File;

      if (originalPdfFile) {
        console.log('✅ Using original PDF file for manual edits');
        pdfToSplit = originalPdfFile;
      } else {
        console.log('⚠️ Original PDF not available, reconstructing from pages');
        const firstPageFile = pdfPages[0];
        const originalFileName = firstPageFile.name.split('_group_')[0] + '.pdf';

        if (pdfPages.length === 1 && !firstPageFile.name.includes('_group_')) {
          pdfToSplit = firstPageFile;
        } else {
          const pdfDoc = await PDFDocument.create();
          for (const pageFile of pdfPages) {
            const pageArrayBuffer = await pageFile.arrayBuffer();
            const pagePdfDoc = await PDFDocument.load(pageArrayBuffer);
            const copiedPages = await pdfDoc.copyPages(pagePdfDoc, pagePdfDoc.getPageIndices());
            copiedPages.forEach(page => pdfDoc.addPage(page));
          }
          const pdfBytes = await pdfDoc.save();
          pdfToSplit = new File([pdfBytes], originalFileName, { type: 'application/pdf' });
        }
      }

      // Get the total page count for validation
      const pdfDoc = await PDFDocument.load(await pdfToSplit.arrayBuffer());
      const totalPages = pdfDoc.getPageCount();

      console.log(`📊 PDF has ${totalPages} pages`);
      console.log('📝 Validating edited groups against original PDF...');

      // Validate page numbers against the PDF we're actually splitting
      for (const group of editedGroups) {
        for (const pageNum of group.pages) {
          if (pageNum < 1 || pageNum > totalPages) {
            const errorMsg = `Invalid page number ${pageNum} in group ${group.groupOrder}. PDF only has ${totalPages} pages (valid range: 1-${totalPages}).`;
            console.error('❌ Validation failed:', errorMsg);
            alert(errorMsg);
            return;
          }
        }
      }

      console.log('✅ All page numbers validated successfully');

      // Split the PDF with manual groups
      const results = await splitPdfWithManualGroups(pdfToSplit, editedGroups);
      const newPdfPages = results.map(r => r.file);

      setManuallyEditedGroups(editedGroups);
      setManuallyEditedPdfPages(newPdfPages);

      console.log('✅ Manual edits applied successfully');
      console.log('📄 New PDF pages created:', newPdfPages.length);
    } catch (error) {
      console.error('Failed to apply manual edits:', error);
      alert(`Failed to apply manual edits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const detectPageTransformationTypes = async () => {
    setIsDetectingTypes(true);
    const detectedTypes: Record<number, TransformationType> = {};
    const detectionResults: PageTransformationInfo[] = [];
    
    console.log('🔍 Starting page-level transformation type detection for', pdfPages.length, 'pages');
    
    for (let pageIndex = 0; pageIndex < pdfPages.length; pageIndex++) {
      const pageFile = pdfPages[pageIndex];
      console.log(`🔍 Detecting transformation type for page ${pageIndex + 1}:`, pageFile.name);
      
      let finalTransformationType = fallbackTransformationType;
      let finalDetectionResult: DetectionResult | null = null;
      
      try {
        const detectionResult = await detectExtractionType({
          pdfFile: pageFile,
          extractionTypes: allTransformationTypes
        });
        
        console.log(`🔍 Page ${pageIndex + 1} detection result:`, detectionResult);
        finalDetectionResult = detectionResult;
        
        if (detectionResult.detectedTypeId) {
          const detectedType = allTransformationTypes.find(type => type.id === detectionResult.detectedTypeId);
          if (detectedType) {
            finalTransformationType = detectedType;
            console.log(`✅ Page ${pageIndex + 1} will use detected type:`, detectedType.name);
          } else {
            console.log(`⚠️ Page ${pageIndex + 1} detected unknown type, using fallback:`, fallbackTransformationType.name);
          }
        } else {
          console.log(`⚠️ Page ${pageIndex + 1} no type detected, using fallback:`, fallbackTransformationType.name);
        }
        
      } catch (detectionError) {
        console.error(`❌ Detection failed for page ${pageIndex + 1}:`, detectionError);
        console.log(`⚠️ Page ${pageIndex + 1} detection failed, using fallback:`, fallbackTransformationType.name);
        
        finalDetectionResult = {
          detectedTypeId: null,
          confidence: null,
          reasoning: `Detection failed: ${detectionError instanceof Error ? detectionError.message : 'Unknown error'}`
        };
      }
      
      // Store the final type and result for this page
      detectedTypes[pageIndex] = finalTransformationType;
      detectionResults[pageIndex] = {
        pageIndex,
        transformationType: finalTransformationType,
        detectionResult: finalDetectionResult,
        success: false,
        completed: false
      };
    }
    
    setPageTransformationTypes(detectedTypes);
    setTransformAllResults(detectionResults);
    setIsDetectingTypes(false);
    console.log('✅ Page-level detection completed. Types assigned:', Object.keys(detectedTypes).length);
  };
  const splitGroupIntoSinglePages = async (groupFile: File, groupConfig: PageGroupConfig | undefined): Promise<{ file: File; originalPageNum: number; groupConfig: PageGroupConfig | undefined }[]> => {
    const arrayBuffer = await groupFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pageCount = pdfDoc.getPageCount();

    if (pageCount <= 1) {
      const pageMatch = groupFile.name.match(/_pages_(\d+)/);
      const originalPageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
      return [{ file: groupFile, originalPageNum, groupConfig }];
    }

    const pagesMatch = groupFile.name.match(/_pages_([\d,]+)\.pdf/);
    const originalPageNums: number[] = [];
    if (pagesMatch) {
      pagesMatch[1].split(',').forEach(p => {
        const n = parseInt(p, 10);
        if (!isNaN(n)) originalPageNums.push(n);
      });
    }

    const results: { file: File; originalPageNum: number; groupConfig: PageGroupConfig | undefined }[] = [];
    for (let i = 0; i < pageCount; i++) {
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(pdfDoc, [i]);
      singleDoc.addPage(copiedPage);
      const singleBytes = await singleDoc.save();
      const origPageNum = originalPageNums[i] || (i + 1);
      const baseName = groupFile.name.replace('.pdf', '');
      const singleFileName = `${baseName}_page_${origPageNum}.pdf`;
      const singleFile = new File([singleBytes], singleFileName, { type: 'application/pdf' });
      results.push({ file: singleFile, originalPageNum: origPageNum, groupConfig });
    }
    return results;
  };

  const handleTransformAll = async () => {
    const sessionId = `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionStartTime = Date.now();

    console.log('===============================================');
    console.log(`INFO [handleTransformAll]: SESSION START - ${sessionId}`);
    console.log(`INFO [handleTransformAll]: Timestamp: ${new Date().toISOString()}`);
    console.log('===============================================');

    const groupFiles = manuallyEditedPdfPages || pdfPages;

    if (groupFiles.length === 0) {
      console.warn(`WARNING [handleTransformAll]: No PDF pages to transform - ${sessionId}`);
      return;
    }

    const hasPageGroups = pageGroupConfigs && pageGroupConfigs.length > 0;

    console.log(`INFO [handleTransformAll]: Group files count: ${groupFiles.length} - ${sessionId}`);
    console.log(`INFO [handleTransformAll]: Using manually edited pages: ${!!manuallyEditedPdfPages} - ${sessionId}`);
    console.log(`INFO [handleTransformAll]: Has page groups: ${hasPageGroups} - ${sessionId}`);

    setIsTransformingAll(true);

    try {
      let pagesToProcess: { file: File; groupConfig: PageGroupConfig | undefined; originalPageNum: number; groupIndex: number }[] = [];

      if (hasPageGroups) {
        for (let groupIndex = 0; groupIndex < groupFiles.length; groupIndex++) {
          const groupFile = groupFiles[groupIndex];
          let currentGroupConfig: PageGroupConfig | undefined = undefined;
          const groupMatch = groupFile.name.match(/_group_(\d+)_/);
          if (groupMatch) {
            const groupOrder = parseInt(groupMatch[1], 10);
            currentGroupConfig = pageGroupConfigs!.find(cfg => cfg.groupOrder === groupOrder);
          }
          const singlePages = await splitGroupIntoSinglePages(groupFile, currentGroupConfig);
          for (const sp of singlePages) {
            pagesToProcess.push({ file: sp.file, groupConfig: sp.groupConfig, originalPageNum: sp.originalPageNum, groupIndex });
          }
        }
        console.log(`INFO [handleTransformAll]: Split ${groupFiles.length} groups into ${pagesToProcess.length} individual pages - ${sessionId}`);
      } else {
        pagesToProcess = groupFiles.map((file, idx) => ({ file, groupConfig: undefined, originalPageNum: idx + 1, groupIndex: idx }));
      }

      const initialResults: PageTransformationInfo[] = pagesToProcess.map((item, idx) => ({
        pageIndex: idx,
        transformationType: pageTransformationTypes[hasPageGroups ? item.groupIndex : idx] || fallbackTransformationType,
        success: false,
        completed: false
      }));
      setTransformAllResults(initialResults);

      for (let pageIndex = 0; pageIndex < pagesToProcess.length; pageIndex++) {
        const pageStartTime = Date.now();
        const { file: pageFile, groupConfig: currentGroupConfig, groupIndex } = pagesToProcess[pageIndex];

        console.log('-----------------------------------------------');
        console.log(`INFO [handleTransformAll]: Processing page ${pageIndex + 1}/${pagesToProcess.length} (${pageFile.name}) - ${sessionId}`);
        console.log('-----------------------------------------------');

        setCurrentProcessingPage(pageIndex);

        const pageTransformationType = pageTransformationTypes[hasPageGroups ? groupIndex : pageIndex] || fallbackTransformationType;

        const activeWorkflowVersion = currentGroupConfig?.workflowVersion || pageTransformationType.workflowVersion || 'v1';
        const activeWorkflowId = activeWorkflowVersion === 'v2'
          ? (currentGroupConfig?.workflowV2Id || pageTransformationType.workflowV2Id)
          : (currentGroupConfig?.workflowId || pageTransformationType.workflowId);
        const workflowSource = (currentGroupConfig?.workflowId || currentGroupConfig?.workflowV2Id) ? 'page_group_config' : 'transformation_type';

        console.log(`INFO [handleTransformAll]: Transformation type: ${pageTransformationType.name} - ${sessionId}`);
        console.log(`TRACE [handleTransformAll]: Page group config present: ${!!currentGroupConfig} - ${sessionId}`);
        console.log(`TRACE [handleTransformAll]: Workflow ID: ${activeWorkflowId || 'none'} (${workflowSource}) - ${sessionId}`);

        let actualUploadedFilename = '';
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const authHeaders = await getAuthHeaders();

        try {
          const pdfBase64 = await fileToBase64(pageFile);

          const requestBody = {
            pdfBase64,
            transformationType: currentGroupConfig ? {
              ...pageTransformationType,
              ...(currentGroupConfig.fieldMappings && { fieldMappings: currentGroupConfig.fieldMappings }),
              ...(currentGroupConfig.filenameTemplate && { filenameTemplate: currentGroupConfig.filenameTemplate })
            } : pageTransformationType,
            additionalInstructions,
            sessionId,
            groupOrder: currentGroupConfig?.groupOrder || null,
            pageIndex: pageIndex
          };

          const transformResponse = await withRetry(
            async () => {
              const response = await fetch(`${supabaseUrl}/functions/v1/pdf-transformer`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(requestBody)
              });

              if (!response.ok) {
                let errorMessage = `Transformation failed with status ${response.status}`;
                try {
                  const errorData = await response.json();
                  errorMessage = errorData.details || errorData.error || errorMessage;
                } catch {
                  // ignore parse error
                }
                throw new Error(errorMessage);
              }

              return response;
            },
            `PDF Transformation (page ${pageIndex + 1})`,
            { maxAttempts: 3, initialDelayMs: 3000, maxDelayMs: 10000 }
          );

          let transformResult;
          try {
            transformResult = await transformResponse.json();
          } catch (parseError) {
            throw new Error('Failed to parse transformation response');
          }

          console.log(`INFO [handleTransformAll]: Transform result - filename: ${transformResult.newFilename} - ${sessionId}`);

          const hasWorkflow = !!(activeWorkflowVersion === 'v2'
            ? (currentGroupConfig?.workflowV2Id || pageTransformationType.workflowV2Id)
            : (currentGroupConfig?.workflowId || pageTransformationType.workflowId));

          setTransformAllResults(prev => prev.map(result => {
            if (result.pageIndex === pageIndex) {
              return {
                ...result,
                success: true,
                newFilename: transformResult.newFilename.replace(/MISSING/g, 'EXTRACTED'),
                transformationType: pageTransformationType,
                detectionResult: result.detectionResult,
                completed: !hasWorkflow
              };
            }
            return result;
          }));

          if (activeWorkflowId) {
            console.log(`INFO [handleTransformAll]: Running workflow ${activeWorkflowId} (${workflowSource}) - ${sessionId}`);
            const fileName = `workflow-pdfs/${Date.now()}-${pageFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const { data: uploadData, error: uploadError } = await supabase.storage.from('pdfs').upload(fileName, pageFile, { upsert: true });

            if (uploadError) {
              throw new Error(`Failed to upload PDF to storage: ${uploadError.message}`);
            }

            const extractedDataFileName = `extracted-data/${Date.now()}-extracted-data.json`;
            const extractedDataToUpload = JSON.stringify(transformResult.extractedData) || '{}';

            const { data: extractedDataUpload, error: extractedDataError } = await supabase.storage
              .from('pdfs')
              .upload(extractedDataFileName, new Blob([extractedDataToUpload], { type: 'application/json' }), { upsert: true });

            if (extractedDataError) {
              throw new Error(`Failed to upload extracted data to storage: ${extractedDataError.message}`);
            }

            const workflowRequestBody = {
              extractedData: JSON.stringify(transformResult.extractedData),
              extractedDataStoragePath: extractedDataUpload.path,
              workflowId: activeWorkflowId,
              userId: user?.id,
              transformationTypeId: pageTransformationType.id,
              pdfFilename: transformResult.newFilename,
              extractionTypeFilename: pageTransformationType.filenameTemplate,
              pageGroupFilenameTemplate: currentGroupConfig?.filenameTemplate,
              pdfPages: 1,
              pdfStoragePath: uploadData.path,
              originalPdfFilename: pageFile.name,
              pdfBase64: pdfBase64,
              formatType: 'JSON',
              sessionId: sessionId,
              groupOrder: currentGroupConfig?.groupOrder || null,
              pageIndex: pageIndex
            };

            let workflowResponse: Response;
            if (activeWorkflowVersion === 'v2') {
              const v2Result = await executeTransformWorkflowV2(workflowRequestBody);
              workflowResponse = new Response(JSON.stringify(v2Result), { status: 200 });
            } else {
              workflowResponse = await fetch(`${supabaseUrl}/functions/v1/transform-workflow-processor`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(workflowRequestBody)
              });
            }

            if (!workflowResponse.ok) {
              const responseText = await workflowResponse.text();
              let errorData;
              try {
                errorData = JSON.parse(responseText);
              } catch (parseError) {
                throw new Error(`Workflow execution failed with status ${workflowResponse.status}: ${responseText}`);
              }
              throw new Error(errorData.details || errorData.error || 'Workflow execution failed');
            }

            const workflowResult = await workflowResponse.json();
            actualUploadedFilename = workflowResult.actualFilename || transformResult.newFilename;
            console.log(`INFO [handleTransformAll]: Workflow complete - filename: ${actualUploadedFilename} - ${sessionId}`);

            try {
              await supabase.storage.from('pdfs').remove([uploadData.path]);
              await supabase.storage.from('pdfs').remove([extractedDataUpload.path]);
            } catch (cleanupError) {
              console.warn('Failed to clean up uploaded files from storage:', cleanupError);
            }

          } else {
            console.log(`INFO [handleTransformAll]: Direct SFTP upload path - ${sessionId}`);
            const sftpPdfBase64 = await fileToBase64(pageFile);

            const baseFilenameForSftp = transformResult.newFilename.replace('.pdf', '');
            actualUploadedFilename = pagesToProcess.length > 1
              ? `${baseFilenameForSftp}_${pageIndex + 1}.pdf`
              : transformResult.newFilename;

            const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/sftp-upload`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                sftpConfig,
                xmlContent: JSON.stringify(transformResult.extractedData),
                pdfBase64: sftpPdfBase64,
                baseFilename: baseFilenameForSftp,
                originalFilename: pageFile.name,
                userId: user?.id,
                transformationTypeId: pageTransformationType.id,
                formatType: 'JSON',
                exactFilename: transformResult.newFilename
              })
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.details || errorData.error || 'Upload failed');
            }

            const uploadResult = await uploadResponse.json();

            if (uploadResult.results && uploadResult.results.length > 0) {
              actualUploadedFilename = uploadResult.results[0].filename;
            } else if (uploadResult.actualFilenames && uploadResult.actualFilenames.length > 0) {
              actualUploadedFilename = uploadResult.actualFilenames[0];
            } else {
              actualUploadedFilename = transformResult.newFilename;
            }
          }

          setTransformAllResults(prev => prev.map(result => {
            if (result.pageIndex === pageIndex) {
              return {
                ...result,
                success: true,
                completed: true,
                newFilename: (actualUploadedFilename || transformResult.newFilename).replace(/MISSING/g, 'EXTRACTED'),
                transformationType: pageTransformationType,
                detectionResult: result.detectionResult
              };
            }
            return result;
          }));

          handleProcessComplete(pageIndex, { success: true, newFilename: (actualUploadedFilename || transformResult.newFilename).replace(/MISSING/g, 'EXTRACTED') });
          console.log(`INFO [handleTransformAll]: Page ${pageIndex + 1} complete - ${sessionId}`);

        } catch (error) {
          console.error(`ERROR [handleTransformAll]: Page ${pageIndex + 1} error: ${error instanceof Error ? error.message : String(error)} - ${sessionId}`);

          setTransformAllResults(prev => prev.map(result => {
            if (result.pageIndex === pageIndex) {
              return {
                ...result,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                completed: true,
                transformationType: pageTransformationType,
                detectionResult: result.detectionResult
              };
            }
            return result;
          }));

          handleProcessComplete(pageIndex, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }

        const pageEndTime = Date.now();
        console.log(`INFO [handleTransformAll]: Page ${pageIndex + 1} completed in ${pageEndTime - pageStartTime}ms - ${sessionId}`);

        if (pageIndex < pagesToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const sessionEndTime = Date.now();
      console.log(`INFO [handleTransformAll]: SESSION COMPLETE - Total time: ${sessionEndTime - sessionStartTime}ms - ${sessionId}`);

    } catch (loopError) {
      console.error(`ERROR [handleTransformAll]: CRITICAL ERROR: ${loopError instanceof Error ? loopError.message : String(loopError)} - ${sessionId}`);
      throw loopError;
    } finally {
      setIsTransformingAll(false);
      setCurrentProcessingPage(null);
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  if (pdfPages.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Page Group Display - Show when page groups are configured */}
      {pageGroupConfigs && pageGroupConfigs.length > 0 && (
        <div className="space-y-6 mb-8">
          {/* Grouped Documents Header */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 dark:bg-green-900/50 p-3 rounded-lg">
                  <Layers className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {(manuallyEditedPdfPages || pdfPages).length} Grouped Document{(manuallyEditedPdfPages || pdfPages).length !== 1 ? 's' : ''} Ready
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    PDF split into {(manuallyEditedPdfPages || pdfPages).length} group{(manuallyEditedPdfPages || pdfPages).length !== 1 ? 's' : ''} based on {manuallyEditedGroups ? 'manually corrected' : 'manual page group configuration'}
                  </p>
                  {manuallyEditedGroups && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      ✓ Manual corrections applied
                    </p>
                  )}
                  {pageRangeInfo && !manuallyEditedGroups && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      Using {pageRangeInfo.usedPages.length} of {pageRangeInfo.totalPages} pages from original PDF
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleOpenManualEditor}
                  disabled={isTransformingAll || isDetectingTypes}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
                >
                  <Edit3 className="h-5 w-5" />
                  <span>Edit Groups</span>
                </button>
                <button
                  onClick={handleTransformAll}
                  disabled={!fallbackTransformationType || isTransformingAll || isDetectingTypes}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
                >
                  {isDetectingTypes ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Detecting Types...</span>
                    </>
                  ) : isTransformingAll ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>
                        Processing Page {currentProcessingPage !== null ? currentProcessingPage + 1 : '...'} of {transformAllResults.length || '...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span>Transform All Groups</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Individual Group Cards */}
          <div className="grid grid-cols-1 gap-4">
            {(manuallyEditedPdfPages || pdfPages).map((groupFile, groupIndex) => {
              const groupConfig = manuallyEditedGroups
                ? manuallyEditedGroups[groupIndex]?.pageGroupConfig
                : pageGroupConfigs[groupIndex];

              const pagesMatch = groupFile.name.match(/_pages_([\d,]+)\.pdf/);
              const pageNums: number[] = [];
              if (pagesMatch) {
                pagesMatch[1].split(',').forEach(p => { const n = parseInt(p, 10); if (!isNaN(n)) pageNums.push(n); });
              }
              const groupPageResults = transformAllResults.filter(r => {
                const rGroupConfig = r.transformationType;
                return rGroupConfig && pageGroupConfigs && pageGroupConfigs[groupIndex] &&
                  transformAllResults.indexOf(r) >= transformAllResults.findIndex((_, i) => {
                    let offset = 0;
                    for (let g = 0; g < groupIndex; g++) {
                      const gFile = (manuallyEditedPdfPages || pdfPages)[g];
                      const gPagesMatch = gFile.name.match(/_pages_([\d,]+)\.pdf/);
                      offset += gPagesMatch ? gPagesMatch[1].split(',').length : 1;
                    }
                    return i === offset;
                  }) &&
                  transformAllResults.indexOf(r) < (() => {
                    let offset = 0;
                    for (let g = 0; g <= groupIndex; g++) {
                      const gFile = (manuallyEditedPdfPages || pdfPages)[g];
                      const gPagesMatch = gFile.name.match(/_pages_([\d,]+)\.pdf/);
                      offset += gPagesMatch ? gPagesMatch[1].split(',').length : 1;
                    }
                    return offset;
                  })();
              });

              let groupStartIdx = 0;
              for (let g = 0; g < groupIndex; g++) {
                const gFile = (manuallyEditedPdfPages || pdfPages)[g];
                const gPagesMatch = gFile.name.match(/_pages_([\d,]+)\.pdf/);
                groupStartIdx += gPagesMatch ? gPagesMatch[1].split(',').length : 1;
              }
              const groupPageCount = pageNums.length || 1;
              const groupResults = transformAllResults.slice(groupStartIdx, groupStartIdx + groupPageCount);
              const allGroupCompleted = groupResults.length > 0 && groupResults.every(r => r.completed);
              const allGroupSuccess = allGroupCompleted && groupResults.every(r => r.success);
              const anyGroupError = allGroupCompleted && groupResults.some(r => !r.success);
              const isGroupProcessing = !allGroupCompleted && groupResults.some((_, i) => currentProcessingPage === groupStartIdx + i);

              return (
                <div
                  key={groupIndex}
                  className={`bg-white dark:bg-gray-800 border rounded-xl p-6 shadow-sm transition-all ${
                    allGroupCompleted
                      ? allGroupSuccess
                        ? 'border-green-300 dark:border-green-600'
                        : 'border-red-300 dark:border-red-600'
                      : isGroupProcessing
                        ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                        : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold ${
                        allGroupCompleted
                          ? allGroupSuccess
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                          : isGroupProcessing
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {allGroupCompleted ? (
                          allGroupSuccess ? <CheckCircle className="h-6 w-6" /> : <XCircle className="h-6 w-6" />
                        ) : isGroupProcessing ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          groupIndex + 1
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            Group {groupIndex + 1}
                          </h4>
                          {pageNums.length > 0 && (
                            <span className="px-2 py-1 bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 text-xs font-medium rounded">
                              {pageNums.length === 1 ? `Page ${pageNums[0]}` : `Pages ${pageNums.join(', ')}`}
                            </span>
                          )}
                          {groupConfig && (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                              {groupPageCount} page{groupPageCount !== 1 ? 's' : ''} per group
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4" />
                            <span className="font-mono text-xs">{groupFile.name}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span>Size: {(groupFile.size / 1024).toFixed(1)} KB</span>
                          </div>
                          {groupResults.length > 0 && groupResults[0]?.transformationType && (
                            <div className="flex items-center space-x-2">
                              <span>Type: {groupResults[0].transformationType.name}</span>
                            </div>
                          )}
                        </div>

                        {isGroupProcessing && (
                          <div className="mt-3 flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm font-medium">
                              Processing page {groupResults.filter(r => r.completed).length + 1} of {groupPageCount}...
                            </span>
                          </div>
                        )}

                        {allGroupCompleted && groupResults.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {groupResults.map((result, rIdx) => (
                              <div key={rIdx} className={`p-3 rounded-lg ${result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'}`}>
                                <div className={`text-sm ${result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                  {result.success && result.newFilename ? (
                                    <>
                                      <span className="font-medium">Page {pageNums[rIdx] || rIdx + 1}: </span>
                                      <span className="font-mono">{result.newFilename}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-medium">Page {pageNums[rIdx] || rIdx + 1} Error: </span>
                                      <span>{result.error}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Transform All Results Summary */}
          {transformAllResults.length > 0 && transformAllResults.every(r => r.completed) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 text-lg">
                  Processing Complete
                </h4>
                <button
                  onClick={() => setTransformAllResults([])}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded transition-colors duration-200"
                >
                  Clear Results
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {transformAllResults.filter(r => r.success).length}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Successful</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {transformAllResults.filter(r => !r.success).length}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vendor Simplified View */}
      {user?.role === 'vendor' ? (
        <div className="space-y-6">
          {/* Page Count and Transform All Button */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-lg">
                  <FileText className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {pdfPages.length} Page{pdfPages.length !== 1 ? 's' : ''} Ready for Processing
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Your PDF has been split into {pdfPages.length} page{pdfPages.length !== 1 ? 's' : ''} for intelligent processing
                  </p>
                </div>
              </div>
              <button
                onClick={handleTransformAll}
                disabled={!fallbackTransformationType || isTransformingAll || isDetectingTypes}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
              >
                {isDetectingTypes ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Detecting Types...</span>
                  </>
                ) : isTransformingAll ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>
                      Processing Page {currentProcessingPage !== null ? currentProcessingPage + 1 : '...'} of {pdfPages.length}
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    <span>Transform All Pages</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Transform All Results for Vendors */}
          {transformAllResults.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 text-lg">
                  {isDetectingTypes ? 'Detecting Transformation Types...' : isTransformingAll ? 'Processing Results' : 'Processing Complete'}
                </h4>
                {!isTransformingAll && !isDetectingTypes && (
                  <button
                    onClick={() => setTransformAllResults([])}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded transition-colors duration-200"
                  >
                    Clear Results
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {transformAllResults.map((result) => (
                  <div key={result.pageIndex} className={`flex items-center justify-between p-4 rounded-lg ${
                    result.completed
                      ? result.success
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'
                      : currentProcessingPage === result.pageIndex
                        ? 'bg-blue-100 dark:bg-blue-800/30 border border-blue-300 dark:border-blue-600'
                        : 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        result.completed
                          ? result.success
                            ? 'bg-green-500 text-white'
                            : 'bg-red-500 text-white'
                          : currentProcessingPage === result.pageIndex
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-300 text-gray-600'
                      }`}>
                        {result.completed ? (
                          result.success ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />
                        ) : (
                          result.pageIndex + 1
                        )}
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${
                          result.completed
                            ? result.success
                              ? 'text-green-800 dark:text-green-300'
                              : 'text-red-800 dark:text-red-300'
                            : currentProcessingPage === result.pageIndex
                              ? 'text-blue-800 dark:text-blue-300'
                              : 'text-gray-600 dark:text-gray-400'
                        }`}>
                          Page {result.pageIndex + 1}
                          {currentProcessingPage === result.pageIndex && !result.completed && (
                            <span className="ml-2 text-blue-600 dark:text-blue-400">Processing...</span>
                          )}
                        </div>
                        {result.transformationType && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Type: {result.transformationType.name}
                            {result.detectionResult && uploadMode === 'auto' && (
                              <span className="ml-2">
                                ({result.detectionResult.detectedTypeId ? 
                                  `AI: ${result.detectionResult.confidence}` : 
                                  'Fallback'})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {result.completed && result.success && result.newFilename && (
                        <div className="text-sm">
                          <span className="text-gray-600 dark:text-gray-400">New Filename: </span>
                          <span className="font-mono text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800/30 px-2 py-1 rounded">
                            {result.newFilename}
                          </span>
                        </div>
                      )}
                      {result.completed && !result.success && result.error && (
                        <div className="text-sm text-red-600 dark:text-red-400 max-w-xs truncate" title={result.error}>
                          Error: {result.error}
                        </div>
                      )}
                      {!result.completed && currentProcessingPage !== result.pageIndex && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">Waiting...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Regular Admin/User View */
        <div>
          {/* Only show individual page cards when NOT using manual page groupings */}
          {!(pageGroupConfigs && pageGroupConfigs.length > 0) && (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                  PDF Pages ({pdfPages.length} page{pdfPages.length !== 1 ? 's' : ''})
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleTransformAll}
                    disabled={!fallbackTransformationType || isTransformingAll || isDetectingTypes}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
                  >
                    {isDetectingTypes ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Detecting Types...</span>
                      </>
                    ) : isTransformingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>
                          Processing Page {currentProcessingPage !== null ? currentProcessingPage + 1 : '...'} of {pdfPages.length}
                        </span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Transform All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Transform All Progress Display */}
              {transformAllResults.length > 0 && (
                <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-300">
                      {isDetectingTypes ? 'Detecting Transformation Types...' : isTransformingAll ? 'Transform All Progress' : 'Transform All Results'}
                    </h4>
                    {!isTransformingAll && !isDetectingTypes && (
                      <button
                        onClick={() => setTransformAllResults([])}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded transition-colors duration-200"
                      >
                        Clear Results
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {transformAllResults.map((result) => (
                      <div key={result.pageIndex} className={`flex items-center justify-between p-3 rounded-lg ${
                        result.completed
                          ? result.success
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'
                          : currentProcessingPage === result.pageIndex
                            ? 'bg-blue-100 dark:bg-blue-800/30 border border-blue-300 dark:border-blue-600'
                            : 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                      }`}>
                        <div className="flex items-center space-x-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            result.completed
                              ? result.success
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                              : currentProcessingPage === result.pageIndex
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-300 text-gray-600'
                          }`}>
                            {result.completed ? (
                              result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />
                            ) : (
                              result.pageIndex + 1
                            )}
                          </div>
                          <div className="flex-1">
                            <div className={`font-medium ${
                              result.completed
                                ? result.success
                                  ? 'text-green-800 dark:text-green-300'
                                  : 'text-red-800 dark:text-red-300'
                                : currentProcessingPage === result.pageIndex
                                  ? 'text-blue-800 dark:text-blue-300'
                                  : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              Page {result.pageIndex + 1}
                              {currentProcessingPage === result.pageIndex && !result.completed && (
                                <span className="ml-2 text-blue-600 dark:text-blue-400">Processing...</span>
                              )}
                            </div>
                            {result.transformationType && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Type: {result.transformationType.name}
                                {result.detectionResult && uploadMode === 'auto' && (
                                  <span className="ml-2">
                                    ({result.detectionResult.detectedTypeId ?
                                      `AI: ${result.detectionResult.confidence}` :
                                      'Fallback'})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {result.completed && result.success && result.newFilename && (
                            <div className="text-sm">
                              <span className="text-gray-600 dark:text-gray-400">Filename: </span>
                              <span className="font-mono text-green-700 dark:text-green-300">{result.newFilename}</span>
                            </div>
                          )}
                          {result.completed && !result.success && result.error && (
                            <div className="text-sm text-red-600 dark:text-red-400 max-w-xs truncate" title={result.error}>
                              Error: {result.error}
                            </div>
                          )}
                          {!result.completed && currentProcessingPage !== result.pageIndex && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Waiting...</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {pdfPages.map((pageFile, pageIndex) => (
                  <PageTransformerCard
                    key={pageIndex}
                    pageFile={pageFile}
                    pageIndex={pageIndex}
                    transformationType={pageTransformationTypes[pageIndex] || fallbackTransformationType}
                    additionalInstructions={additionalInstructions}
                    sftpConfig={sftpConfig}
                    settingsConfig={settingsConfig}
                    apiConfig={apiConfig}
                    user={user}
                    workflowSteps={workflowSteps}
                    isTransformingAll={isTransformingAll}
                    pageGroupConfig={undefined}
                    onProcessStart={handleProcessStart}
                    onProcessComplete={handleProcessComplete}
                    hidePreview={user?.role === 'vendor'}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual Group Editor Modal */}
      {pageGroupConfigs && pageGroupConfigs.length > 0 && showManualEditor && (
        <ManualGroupEditor
          isOpen={showManualEditor}
          onClose={handleCloseManualEditor}
          totalPages={pageRangeInfo?.totalPages || pdfPages.length}
          currentGroups={(() => {
            const groupMap = new Map<number, { pages: number[]; config: PageGroupConfig }>();
            pdfPages.forEach((pageFile, idx) => {
              const groupMatch = pageFile.name.match(/_group_(\d+)_/);
              const groupOrder = groupMatch ? parseInt(groupMatch[1], 10) : idx + 1;
              const pageRangeMatch = pageFile.name.match(/_pages_(.+?)\.pdf/);
              const pages: number[] = [];
              if (pageRangeMatch) {
                const pagesStr = pageRangeMatch[1];
                if (pagesStr.includes(',')) {
                  pagesStr.split(',').forEach(p => { const n = parseInt(p); if (!isNaN(n)) pages.push(n); });
                } else if (pagesStr.includes('-')) {
                  const [start, end] = pagesStr.split('-').map(Number);
                  for (let i = start; i <= end; i++) pages.push(i);
                } else {
                  const n = parseInt(pagesStr); if (!isNaN(n)) pages.push(n);
                }
              } else {
                pages.push(idx + 1);
              }
              const existing = groupMap.get(groupOrder);
              if (existing) {
                existing.pages.push(...pages);
              } else {
                const config = pageGroupConfigs.find(cfg => cfg.groupOrder === groupOrder) || {
                  id: `temp-${groupOrder}`,
                  transformationTypeId: fallbackTransformationType.id,
                  groupOrder,
                  pagesPerGroup: pages.length,
                  processMode: 'all' as const
                };
                groupMap.set(groupOrder, { pages, config });
              }
            });
            return Array.from(groupMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([, { pages, config }], idx) => ({
                groupIndex: idx,
                pages: pages.sort((a, b) => a - b),
                pageGroupConfig: config
              }));
          })()}
          onSave={handleSaveManualEdits}
        />
      )}
    </div>
  );
});

export default MultiPageTransformer;