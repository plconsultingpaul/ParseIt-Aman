import React, { useState, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import PageProcessorCard from './PageProcessorCard';
import PageGroupCard from './PageGroupCard';
import AiReviewModal from './AiReviewModal';
import type { ExtractionType, SftpConfig, SettingsConfig, ApiConfig, User, PageProcessingState, ApiError, WorkflowExecutionLog, FieldMappingFunction } from '../../types';
import { extractDataFromPDF, extractJsonFromMultiPagePDF } from '../../lib/gemini';
import { extractCsvFromPDF, extractCsvFromMultiPagePDF } from '../../lib/csvExtractor';
import { uploadToSftp } from '../../lib/sftp';
import { executeWorkflow } from '../../lib/workflow';
import { sendToApi } from '../../lib/apiClient';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';
import { getAuthHeaders } from '../../lib/supabase';

interface MultiPageProcessorProps {
  pdfPages: File[];
  currentExtractionType: ExtractionType;
  additionalInstructions: string;
  sftpConfig: SftpConfig;
  settingsConfig: SettingsConfig;
  apiConfig: ApiConfig;
  user: User | null;
  workflowSteps: any[];
  onRemovePage: (pageIndex: number) => void;
}

export default function MultiPageProcessor({
  pdfPages,
  currentExtractionType,
  additionalInstructions,
  sftpConfig,
  settingsConfig,
  apiConfig,
  user,
  workflowSteps,
  onRemovePage
}: MultiPageProcessorProps) {
  const [isExtractingAll, setIsExtractingAll] = useState(false);
  const [currentProcessingPage, setCurrentProcessingPage] = useState<number | null>(null);
  const [pageProcessingStates, setPageProcessingStates] = useState<PageProcessingState[]>([]);
  const [functions, setFunctions] = useState<FieldMappingFunction[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewConfidenceScores, setReviewConfidenceScores] = useState<Record<string, number> | undefined>();
  const [pendingReviewData, setPendingReviewData] = useState<string>('');
  const [pendingReviewPageIndex, setPendingReviewPageIndex] = useState<number | null>(null);
  const [pendingReviewFilename, setPendingReviewFilename] = useState<string>('');
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const [pendingReviewGroupIndices, setPendingReviewGroupIndices] = useState<number[] | null>(null);

  const isJsonType = currentExtractionType?.formatType === 'JSON';
  const isCsvType = currentExtractionType?.formatType === 'CSV';
  const combinePagesAsOne = currentExtractionType?.combinePagesAsSingleExtraction === true;
  const isCsvMultiPage = isCsvType && (currentExtractionType?.csvMultiPageProcessing === true || combinePagesAsOne);
  const isJsonMultiPage = isJsonType && (currentExtractionType?.jsonMultiPageProcessing === true || combinePagesAsOne);

  // Initialize page processing states when pdfPages or currentExtractionType changes
  useEffect(() => {
    const initialStates: PageProcessingState[] = pdfPages.map(() => ({
      isProcessing: false,
      isExtracting: false,
      extractedData: '',
      workflowOnlyData: '',
      extractionError: '',
      apiResponse: '',
      apiError: null,
      success: false
    }));
    setPageProcessingStates(initialStates);
  }, [pdfPages, currentExtractionType]);

  // Load function definitions when extraction type changes
  useEffect(() => {
    const loadFunctions = async () => {
      if (currentExtractionType?.id) {
        try {
          const funcs = await fieldMappingFunctionService.getFunctionsByExtractionType(currentExtractionType.id);
          setFunctions(funcs);
        } catch (error) {
          console.warn('Failed to load field mapping functions:', error);
          setFunctions([]);
        }
      } else {
        setFunctions([]);
      }
    };
    loadFunctions();
  }, [currentExtractionType?.id]);

  const updatePageState = (pageIndex: number, updates: Partial<PageProcessingState>) => {
    setPageProcessingStates(prev => 
      prev.map((state, index) => 
        index === pageIndex ? { ...state, ...updates } : state
      )
    );
  };

  const fetchWorkflowExecutionLog = async (logId: string): Promise<WorkflowExecutionLog | null> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${logId}`, {
        headers
      });

      if (!response.ok) {
        console.error('Failed to fetch workflow execution log:', response.status);
        return null;
      }

      const data = await response.json();
      if (data && data.length > 0) {
        const log = data[0];
        return {
          id: log.id,
          extractionLogId: log.extraction_log_id,
          workflowId: log.workflow_id,
          status: log.status,
          currentStepId: log.current_step_id,
          currentStepName: log.current_step_name,
          errorMessage: log.error_message,
          contextData: log.context_data,
          startedAt: log.started_at,
          updatedAt: log.updated_at,
          completedAt: log.completed_at
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching workflow execution log:', error);
      return null;
    }
  };

  const filterOutWorkflowOnlyFields = (data: any, wfoFieldMappings: any[]): any => {
    if (!data || !wfoFieldMappings || wfoFieldMappings.length === 0) {
      return data;
    }

    try {
      const wfoFieldNames = wfoFieldMappings.map(m => m.fieldName);

      const filterObject = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
          return obj.map(item => filterObject(item));
        }

        const filtered: any = {};
        for (const key of Object.keys(obj)) {
          if (!wfoFieldNames.includes(key)) {
            filtered[key] = obj[key];
          }
        }
        return filtered;
      };

      return filterObject(data);
    } catch (error) {
      console.error('Error filtering workflow-only fields:', error);
      return data;
    }
  };

  const separateWorkflowOnlyData = (extractedData: string, fieldMappings: any[]) => {
    if (!fieldMappings || fieldMappings.length === 0) {
      return { outputData: extractedData, workflowData: '{}' };
    }

    const workflowOnlyFields = fieldMappings.filter((m: any) => m.isWorkflowOnly);

    if (workflowOnlyFields.length === 0) {
      return { outputData: extractedData, workflowData: '{}' };
    }

    try {
      const parsed = JSON.parse(extractedData);
      const wfoFieldNames = workflowOnlyFields.map((m: any) => m.fieldName);
      const nonWfoFieldNames = fieldMappings
        .filter((m: any) => !m.isWorkflowOnly)
        .map((m: any) => m.fieldName);

      const filterForOutput = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
          return obj.map(item => filterForOutput(item));
        }
        const filtered: any = {};
        for (const key of Object.keys(obj)) {
          if (!wfoFieldNames.includes(key)) {
            filtered[key] = obj[key];
          }
        }
        return filtered;
      };

      const filterForWorkflow = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
          return obj.map(item => filterForWorkflow(item));
        }
        const filtered: any = {};
        for (const key of Object.keys(obj)) {
          if (wfoFieldNames.includes(key)) {
            filtered[key] = obj[key];
          }
        }
        return filtered;
      };

      const outputData = filterForOutput(parsed);
      const workflowData = filterForWorkflow(parsed);

      return {
        outputData: JSON.stringify(outputData, null, 2),
        workflowData: JSON.stringify(workflowData, null, 2)
      };
    } catch (error) {
      console.error('Error separating workflow data:', error);
      return { outputData: extractedData, workflowData: '{}' };
    }
  };

  const processPageAction = async (pageIndex: number, actionType: 'preview' | 'process') => {
    const startTime = performance.now();
    console.log(`\n[MultiPageProcessor] ========================================`);
    console.log(`[MultiPageProcessor] Starting ${actionType} for page ${pageIndex + 1}`);
    console.log(`[MultiPageProcessor] Timestamp: ${new Date().toISOString()}`);

    const pageFile = pdfPages[pageIndex];
    if (!pageFile || !currentExtractionType) {
      console.error(`[MultiPageProcessor] Missing pageFile or extraction type for page ${pageIndex + 1}`);
      return;
    }

    console.log(`[MultiPageProcessor] File details:`);
    console.log(`  - Name: ${pageFile.name}`);
    console.log(`  - Size: ${(pageFile.size / 1024).toFixed(2)} KB`);
    console.log(`  - Type: ${pageFile.type}`);
    console.log(`[MultiPageProcessor] Extraction type: ${currentExtractionType.name} (${currentExtractionType.formatType})`);
    console.log(`[MultiPageProcessor] Is CSV type: ${isCsvType}`);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authHeaders = await getAuthHeaders();

    // Reset state for this page
    console.log(`[MultiPageProcessor] Resetting page state for ${actionType}...`);
    updatePageState(pageIndex, {
      isExtracting: actionType === 'preview',
      isProcessing: actionType === 'process',
      extractionError: '',
      apiResponse: '',
      apiError: null,
      success: false
    });

    try {
      // Extract data from PDF
      let extractionResult: { templateData: string; workflowOnlyData: string };

      if (isCsvType) {
        console.log(`[MultiPageProcessor] CSV extraction starting...`);
        console.log(`[MultiPageProcessor] Field mappings count: ${currentExtractionType.fieldMappings?.length || 0}`);
        console.log(`[MultiPageProcessor] Delimiter: "${currentExtractionType.csvDelimiter || ','}"`);
        console.log(`[MultiPageProcessor] Include headers: ${currentExtractionType.csvIncludeHeaders !== false}`);

        const extractionStartTime = performance.now();
        // Use CSV extraction for CSV types
        extractionResult = await extractCsvFromPDF({
          pdfFile: pageFile,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          fieldMappings: currentExtractionType.fieldMappings,
          rowDetectionInstructions: currentExtractionType.csvRowDetectionInstructions,
          delimiter: currentExtractionType.csvDelimiter,
          includeHeaders: currentExtractionType.csvIncludeHeaders,
        });
        const extractionEndTime = performance.now();
        console.log(`[MultiPageProcessor] CSV extraction completed in ${((extractionEndTime - extractionStartTime) / 1000).toFixed(2)}s`);
      } else {
        const fullResult = await extractDataFromPDF({
          pdfFile: pageFile,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          formatTemplate: currentExtractionType.formatTemplate,
          formatType: currentExtractionType.formatType,
          fieldMappings: currentExtractionType.fieldMappings,
          parseitIdMapping: currentExtractionType.parseitIdMapping,
          traceTypeMapping: currentExtractionType.traceTypeMapping,
          traceTypeValue: currentExtractionType.traceTypeValue,
          arraySplitConfigs: currentExtractionType.arraySplitConfigs,
          arrayEntryConfigs: currentExtractionType.arrayEntryConfigs,
          functions,
          enableConfidenceScoring: actionType === 'process' ? currentExtractionType.enableConfidenceScoring : false
        });
        extractionResult = fullResult;

        if (fullResult.confidenceScores) {
          updatePageState(pageIndex, { confidenceScores: fullResult.confidenceScores });
          setReviewConfidenceScores(fullResult.confidenceScores);
        }
      }

      const { templateData, workflowOnlyData } = extractionResult;

      console.log(`[MultiPageProcessor] Extraction completed for page ${pageIndex + 1}`);
      console.log(`[MultiPageProcessor] Template data length: ${templateData.length} characters`);
      console.log(`[MultiPageProcessor] Template data type: ${typeof templateData}`);
      console.log(`[MultiPageProcessor] Workflow data length: ${workflowOnlyData.length} characters`);
      console.log(`[MultiPageProcessor] Template data preview (first 300 chars): ${templateData.substring(0, 300)}`);
      console.log(`[MultiPageProcessor] Template data preview (last 200 chars): ${templateData.substring(templateData.length - 200)}`);
      console.log(`[MultiPageProcessor] Workflow data: ${workflowOnlyData}`);

      // Validate the extracted data before storing in state
      if (!templateData || typeof templateData !== 'string') {
        console.error(`[MultiPageProcessor] ❌ CRITICAL ERROR: templateData is not a valid string!`);
        console.error(`[MultiPageProcessor] templateData type: ${typeof templateData}`);
        console.error(`[MultiPageProcessor] templateData value:`, templateData);
        throw new Error('Template data is not a valid string');
      }

      if (templateData === '0' || templateData === 'undefined' || templateData === 'null') {
        console.error(`[MultiPageProcessor] ❌ CRITICAL ERROR: templateData is invalid: "${templateData}"`);
        throw new Error(`Invalid template data: "${templateData}"`);
      }

      console.log(`[MultiPageProcessor] ✅ Extracted data validated successfully`);
      console.log(`[MultiPageProcessor] Updating page state with extracted data...`);

      updatePageState(pageIndex, {
        extractedData: templateData,
        workflowOnlyData: workflowOnlyData,
        isExtracting: false
      });

      console.log(`[MultiPageProcessor] ✅ Page state updated with extracted data`);
      console.log(`[MultiPageProcessor] Stored template data length: ${templateData.length} characters`);
      console.log(`[MultiPageProcessor] Stored workflow data length: ${workflowOnlyData.length} characters`);

      if (actionType === 'process' && currentExtractionType.enableReview) {
        setReviewQueue([]);
        setPendingReviewData(templateData);
        setPendingReviewPageIndex(pageIndex);
        setPendingReviewFilename(pageFile.name);
        setShowReviewModal(true);
        updatePageState(pageIndex, { isProcessing: false });
        return;
      }

      if (actionType === 'process') {
        const hasWorkflow = currentExtractionType.workflowVersion === 'v2' ? !!currentExtractionType.workflowV2Id : !!currentExtractionType.workflowId;
        if (hasWorkflow) {
          try {
            const pdfBase64 = await fileToBase64(pageFile);

            const workflowResult = await executeWorkflow({
              extractedData: templateData,
              workflowOnlyData: workflowOnlyData,
              workflowId: currentExtractionType.workflowVersion === 'v2' ? currentExtractionType.workflowV2Id! : currentExtractionType.workflowId,
              userId: user?.id,
              extractionTypeId: currentExtractionType.id,
              pdfFilename: pageFile.name,
              pdfPages: 1,
              pdfBase64: pdfBase64,
              originalPdfFilename: pageFile.name,
              formatType: currentExtractionType.formatType,
              extractionTypeFilename: currentExtractionType.filename,
              workflowVersion: currentExtractionType.workflowVersion as 'v1' | 'v2' | undefined
            });
            
            // Store the workflow execution log ID for status tracking
            updatePageState(pageIndex, {
              workflowExecutionLogId: workflowResult.workflowExecutionLogId
            });
            
            // Fetch the complete workflow execution log
            const workflowLog = await fetchWorkflowExecutionLog(workflowResult.workflowExecutionLogId);
            
            updatePageState(pageIndex, {
              apiResponse: workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse, null, 2) : JSON.stringify(workflowResult.finalData, null, 2),
              apiError: null,
              success: true,
              isProcessing: false,
              workflowExecutionLog: workflowLog,
              userMessage: workflowResult.finalData?.userMessage || undefined
            });
          } catch (workflowError) {
            console.error('Workflow execution failed:', workflowError);
            const errorMessage = workflowError instanceof Error ? workflowError.message : 'Unknown workflow error';
            console.error('Detailed workflow error:', errorMessage);

            let workflowLog = null;
            if ((workflowError as any).workflowExecutionLogId) {
              try {
                workflowLog = await fetchWorkflowExecutionLog((workflowError as any).workflowExecutionLogId);
              } catch (fetchError) {
                console.error('Failed to fetch workflow execution log on error:', fetchError);
              }
            }
            
            updatePageState(pageIndex, {
              extractionError: `Workflow execution failed: ${errorMessage}`,
              isProcessing: false,
              workflowExecutionLog: workflowLog
            });
          }
        } else if (isJsonType) {
          // For JSON types, get Parse-It ID and send to API
          let parseitId: number | undefined;
          try {
            // Get a fresh Parse-It ID for each submission
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_parseit_id`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({})
            });

            if (!response.ok) {
              throw new Error('Failed to get Parse-It ID');
            }

            parseitId = await response.json();

            // Replace Parse-It ID placeholder with actual ID
            let finalJsonData = templateData;
            if (currentExtractionType.parseitIdMapping && parseitId) {
              finalJsonData = finalJsonData.replace(/{{PARSE_IT_ID_PLACEHOLDER}}/g, parseitId.toString());
            }
            
            // Update the displayed extracted data with the final data (including Parse-It ID)
            updatePageState(pageIndex, {
              extractedData: finalJsonData
            });

            // Strip workflow-only fields before sending to API
            let apiJsonData = finalJsonData;
            console.log('[SendToApi:SinglePage] ==========================================');
            console.log('[SendToApi:SinglePage] page:', pageIndex + 1, 'finalJsonData BEFORE WFO strip:', finalJsonData);
            const functionMappingsDbg1 = (currentExtractionType.fieldMappings || []).filter((m: any) => m.type === 'function');
            console.log('[SendToApi:SinglePage] function-type mappings:', functionMappingsDbg1.map((m: any) => ({ fieldName: m.fieldName, functionId: m.functionId, isWorkflowOnly: !!m.isWorkflowOnly })));
            if (currentExtractionType.fieldMappings && currentExtractionType.fieldMappings.length > 0) {
              const wfoFields = currentExtractionType.fieldMappings.filter((m: any) => m.isWorkflowOnly);
              console.log('[SendToApi:SinglePage] WFO fields being stripped:', wfoFields.map((m: any) => m.fieldName));
              if (wfoFields.length > 0) {
                const parsed = JSON.parse(finalJsonData);
                const filtered = filterOutWorkflowOnlyFields(parsed, wfoFields);
                apiJsonData = JSON.stringify(filtered);
                console.log(`Stripped ${wfoFields.length} workflow-only fields before API call`);
              }
            }
            console.log('[SendToApi:SinglePage] apiJsonData AFTER WFO strip:', apiJsonData);
            console.log('[SendToApi:SinglePage] ==========================================');

            // Send JSON data to API with Parse-It ID (WFO fields excluded)
            const apiResponseData = await sendToApi(apiJsonData, currentExtractionType);

            updatePageState(pageIndex, {
              apiResponse: JSON.stringify(apiResponseData, null, 2),
              apiError: null
            });
            
            // Extract filename part from API response for SFTP upload
            let customFilenamePart: string | undefined;
            try {
              // Try to extract billNumber from API response
              if (apiResponseData && typeof apiResponseData === 'object') {
                if (apiResponseData.billNumber) {
                  customFilenamePart = apiResponseData.billNumber;
                } else if (apiResponseData.orders && Array.isArray(apiResponseData.orders) && apiResponseData.orders.length > 0 && apiResponseData.orders[0].billNumber) {
                  customFilenamePart = apiResponseData.orders[0].billNumber;
                } else if (apiResponseData.data && apiResponseData.data.billNumber) {
                  customFilenamePart = apiResponseData.data.billNumber;
                }
              }
            } catch (error) {
              console.warn('Could not extract filename from API response:', error);
            }
            
            // Log successful API call
            try {
              await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                  user_id: user?.id || null,
                  extraction_type_id: currentExtractionType.id,
                  pdf_filename: pageFile.name,
                  pdf_pages: 1,
                  extraction_status: 'success',
                  error_message: null,
                  api_response: JSON.stringify(apiResponseData),
                  api_status_code: 201,
                  api_error: null,
                  extracted_data: finalJsonData,
                  created_at: new Date().toISOString()
                })
              });
            } catch (logError) {
              console.warn('Failed to log JSON extraction:', logError);
            }
          } catch (apiError) {
            // Handle API errors
            let formattedError: ApiError;
            if (apiError instanceof Error) {
              formattedError = {
                statusCode: 0,
                statusText: 'Network Error',
                details: apiError.message,
                url: apiConfig.path + (currentExtractionType?.jsonPath || ''),
                headers: {}
              };
            } else {
              formattedError = apiError as ApiError;
            }

            updatePageState(pageIndex, {
              apiError: formattedError
            });

            // Log failed API call
            try {
              console.log('Logging failed JSON extraction for page:', pageIndex + 1, formattedError);
              await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                  user_id: user?.id || null,
                  extraction_type_id: currentExtractionType.id,
                  pdf_filename: pageFile.name,
                  pdf_pages: 1,
                  extraction_status: 'failed',
                  error_message: formattedError.statusCode > 0
                    ? `API Error ${formattedError.statusCode}: ${formattedError.statusText}`
                    : formattedError.details,
                  api_response: formattedError.details ? JSON.stringify(formattedError.details) : null,
                  api_status_code: formattedError.statusCode > 0 ? formattedError.statusCode : null,
                  api_error: JSON.stringify(formattedError),
                  extracted_data: templateData,
                  created_at: new Date().toISOString()
                })
              });
            } catch (logError) {
              console.error('Failed to log failed JSON extraction for page', pageIndex + 1, ':', logError);
            }
            throw apiError;
          }
        } else {
          // For CSV/XML types without workflows, handle SFTP upload
          try {
            await uploadToSftp({
              sftpConfig,
              xmlContent: templateData,
              pdfFile: pageFile,
              baseFilename: currentExtractionType.filename || 'document',
              formatType: currentExtractionType.formatType
            });

            updatePageState(pageIndex, {
              success: true,
              isProcessing: false
            });
          } catch (sftpError) {
            const errorMessage = sftpError instanceof Error ? sftpError.message : 'Unknown SFTP error';
            updatePageState(pageIndex, {
              extractionError: `Failed to upload to SFTP: ${errorMessage}`,
              isProcessing: false
            });
          }
        }
        
        updatePageState(pageIndex, {
          success: true,
          isProcessing: false
        });
      } else {
        updatePageState(pageIndex, {
          isExtracting: false
        });
      }
    } catch (error) {
      const errorTime = performance.now();
      const elapsedTime = ((errorTime - startTime) / 1000).toFixed(2);
      console.error(`[MultiPageProcessor] ❌ Error ${actionType}ing page ${pageIndex + 1} after ${elapsedTime}s:`, error);
      console.error(`[MultiPageProcessor] Error details:`, error instanceof Error ? error.message : error);
      console.error(`[MultiPageProcessor] Error stack:`, error instanceof Error ? error.stack : 'N/A');

      // For JSON processing errors, the error handling is done above in the API section
      updatePageState(pageIndex, {
        isExtracting: false,
        isProcessing: false,
        extractionError: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      const endTime = performance.now();
      const totalTime = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`[MultiPageProcessor] Total ${actionType} time for page ${pageIndex + 1}: ${totalTime}s`);
      console.log(`[MultiPageProcessor] ========================================\n`);
    }
  };

  const processNextInReviewQueue = useCallback(async (completedPageIndex: number) => {
    setReviewQueue(prev => {
      const remaining = prev.filter(i => i !== completedPageIndex);
      if (remaining.length === 0) {
        setIsExtractingAll(false);
        setCurrentProcessingPage(null);
        return [];
      }
      const nextPage = remaining[0];
      setCurrentProcessingPage(nextPage);
      setTimeout(() => processPageAction(nextPage, 'process'), 500);
      return remaining;
    });
  }, []);

  const handleReviewConfirm = useCallback(async (editedData: string) => {
    setShowReviewModal(false);
    const pageIndex = pendingReviewPageIndex;
    if (pageIndex === null) return;

    const groupIndices = pendingReviewGroupIndices;
    const isGroupedReview = groupIndices !== null && groupIndices.length > 0;

    if (isGroupedReview) {
      groupIndices.forEach(i => updatePageState(i, { extractedData: editedData, isProcessing: true }));
    } else {
      updatePageState(pageIndex, { extractedData: editedData, isProcessing: true });
    }
    setPendingReviewPageIndex(null);
    setPendingReviewGroupIndices(null);

    const isQueuedRun = reviewQueue.length > 0;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      if (isGroupedReview) {
        const groupPages = groupIndices.map(i => pdfPages[i]);

        const hasWorkflowGroup = currentExtractionType.workflowVersion === 'v2' ? !!currentExtractionType.workflowV2Id : !!currentExtractionType.workflowId;
        if (hasWorkflowGroup) {
          const pdfBase64 = await fileToBase64(groupPages[0]);
          const workflowResult = await executeWorkflow({
            extractedData: editedData,
            workflowId: currentExtractionType.workflowVersion === 'v2' ? currentExtractionType.workflowV2Id! : currentExtractionType.workflowId,
            userId: user?.id,
            extractionTypeId: currentExtractionType.id,
            pdfFilename: groupPages[0].name,
            pdfPages: groupPages.length,
            pdfBase64,
            originalPdfFilename: groupPages[0].name,
            formatType: currentExtractionType.formatType,
            extractionTypeFilename: currentExtractionType.filename,
            workflowVersion: currentExtractionType.workflowVersion as 'v1' | 'v2' | undefined
          });

          const workflowLog = await fetchWorkflowExecutionLog(workflowResult.workflowExecutionLogId);
          groupIndices.forEach(i => {
            updatePageState(i, {
              workflowExecutionLogId: workflowResult.workflowExecutionLogId,
              apiResponse: workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse, null, 2) : JSON.stringify(workflowResult.finalData, null, 2),
              apiError: null,
              success: true,
              isProcessing: false,
              workflowExecutionLog: workflowLog,
              userMessage: workflowResult.finalData?.userMessage || undefined
            });
          });
        } else if (isJsonType) {
          let parseitId: number | undefined;
          try {
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_parseit_id`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({})
            });
            if (response.ok) parseitId = await response.json();
          } catch (idError) {
            console.warn('Failed to get Parse-It ID:', idError);
          }

          let finalJsonData = editedData;
          if (currentExtractionType.parseitIdMapping && parseitId) {
            finalJsonData = finalJsonData.replace(/{{PARSE_IT_ID_PLACEHOLDER}}/g, parseitId.toString());
          }
          groupIndices.forEach(i => updatePageState(i, { extractedData: finalJsonData }));

          let apiJsonData = finalJsonData;
          console.log('[SendToApi:ReviewGroup] ==========================================');
          console.log('[SendToApi:ReviewGroup] finalJsonData BEFORE WFO strip:', finalJsonData);
          const functionMappingsDbg2 = (currentExtractionType.fieldMappings || []).filter((m: any) => m.type === 'function');
          console.log('[SendToApi:ReviewGroup] function-type mappings:', functionMappingsDbg2.map((m: any) => ({ fieldName: m.fieldName, functionId: m.functionId, isWorkflowOnly: !!m.isWorkflowOnly })));
          if (currentExtractionType.fieldMappings?.length) {
            const wfoFields = currentExtractionType.fieldMappings.filter((m: any) => m.isWorkflowOnly);
            console.log('[SendToApi:ReviewGroup] WFO fields being stripped:', wfoFields.map((m: any) => m.fieldName));
            if (wfoFields.length > 0) {
              const parsed = JSON.parse(finalJsonData);
              const filtered = filterOutWorkflowOnlyFields(parsed, wfoFields);
              apiJsonData = JSON.stringify(filtered);
            }
          }
          console.log('[SendToApi:ReviewGroup] apiJsonData AFTER WFO strip:', apiJsonData);
          console.log('[SendToApi:ReviewGroup] ==========================================');

          const apiResponseData = await sendToApi(apiJsonData, currentExtractionType);

          try {
            await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                user_id: user?.id || null,
                extraction_type_id: currentExtractionType.id,
                pdf_filename: groupPages[0].name,
                pdf_pages: groupPages.length,
                extraction_status: 'success',
                error_message: null,
                api_response: JSON.stringify(apiResponseData),
                api_status_code: 201,
                api_error: null,
                extracted_data: finalJsonData,
                created_at: new Date().toISOString()
              })
            });
          } catch (logError) {
            console.warn('Failed to log JSON extraction:', logError);
          }

          groupIndices.forEach(i => {
            updatePageState(i, {
              apiResponse: JSON.stringify(apiResponseData, null, 2),
              apiError: null,
              success: true,
              isProcessing: false
            });
          });
        } else {
          await uploadToSftp({
            sftpConfig,
            xmlContent: editedData,
            pdfFile: groupPages[0],
            baseFilename: currentExtractionType.filename || 'combined',
            formatType: currentExtractionType.formatType
          });
          groupIndices.forEach(i => updatePageState(i, { success: true, isProcessing: false }));
        }
      } else {
        const pageFile = pdfPages[pageIndex];

        const hasWorkflow = currentExtractionType.workflowVersion === 'v2' ? !!currentExtractionType.workflowV2Id : !!currentExtractionType.workflowId;
        if (hasWorkflow) {
          const pdfBase64 = await fileToBase64(pageFile);
          const workflowResult = await executeWorkflow({
            extractedData: editedData,
            workflowId: currentExtractionType.workflowVersion === 'v2' ? currentExtractionType.workflowV2Id! : currentExtractionType.workflowId,
            userId: user?.id,
            extractionTypeId: currentExtractionType.id,
            pdfFilename: pageFile.name,
            pdfPages: 1,
            pdfBase64,
            originalPdfFilename: pageFile.name,
            formatType: currentExtractionType.formatType,
            extractionTypeFilename: currentExtractionType.filename,
            workflowVersion: currentExtractionType.workflowVersion as 'v1' | 'v2' | undefined
          });

          const workflowLog = await fetchWorkflowExecutionLog(workflowResult.workflowExecutionLogId);
          updatePageState(pageIndex, {
            workflowExecutionLogId: workflowResult.workflowExecutionLogId,
            apiResponse: workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse, null, 2) : JSON.stringify(workflowResult.finalData, null, 2),
            apiError: null,
            success: true,
            isProcessing: false,
            workflowExecutionLog: workflowLog,
            userMessage: workflowResult.finalData?.userMessage || undefined
          });
        } else if (isJsonType) {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_parseit_id`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({})
          });
          const parseitId = response.ok ? await response.json() : undefined;

          let finalJsonData = editedData;
          if (currentExtractionType.parseitIdMapping && parseitId) {
            finalJsonData = finalJsonData.replace(/{{PARSE_IT_ID_PLACEHOLDER}}/g, parseitId.toString());
          }
          updatePageState(pageIndex, { extractedData: finalJsonData });

          let apiJsonData = finalJsonData;
          console.log('[SendToApi:ReviewSingle] ==========================================');
          console.log('[SendToApi:ReviewSingle] page:', pageIndex + 1, 'finalJsonData BEFORE WFO strip:', finalJsonData);
          const functionMappingsDbg3 = (currentExtractionType.fieldMappings || []).filter((m: any) => m.type === 'function');
          console.log('[SendToApi:ReviewSingle] function-type mappings:', functionMappingsDbg3.map((m: any) => ({ fieldName: m.fieldName, functionId: m.functionId, isWorkflowOnly: !!m.isWorkflowOnly })));
          if (currentExtractionType.fieldMappings?.length) {
            const wfoFields = currentExtractionType.fieldMappings.filter((m: any) => m.isWorkflowOnly);
            console.log('[SendToApi:ReviewSingle] WFO fields being stripped:', wfoFields.map((m: any) => m.fieldName));
            if (wfoFields.length > 0) {
              const parsed = JSON.parse(finalJsonData);
              const filtered = filterOutWorkflowOnlyFields(parsed, wfoFields);
              apiJsonData = JSON.stringify(filtered);
            }
          }
          console.log('[SendToApi:ReviewSingle] apiJsonData AFTER WFO strip:', apiJsonData);
          console.log('[SendToApi:ReviewSingle] ==========================================');

          const apiResponseData = await sendToApi(apiJsonData, currentExtractionType);
          updatePageState(pageIndex, {
            apiResponse: JSON.stringify(apiResponseData, null, 2),
            apiError: null,
            success: true,
            isProcessing: false
          });
        } else {
          await uploadToSftp({
            sftpConfig,
            xmlContent: editedData,
            pdfFile: pageFile,
            baseFilename: currentExtractionType.filename || 'document',
            formatType: currentExtractionType.formatType
          });
          updatePageState(pageIndex, { success: true, isProcessing: false });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (isGroupedReview && groupIndices) {
        groupIndices.forEach(i => {
          updatePageState(i, { extractionError: errorMessage, isProcessing: false });
        });
      } else {
        updatePageState(pageIndex!, {
          extractionError: errorMessage,
          isProcessing: false
        });
      }
    }

    if (isQueuedRun && isExtractingAll) {
      await processNextInReviewQueue(pageIndex);
    }
  }, [pendingReviewPageIndex, pendingReviewGroupIndices, pdfPages, currentExtractionType, user, sftpConfig, isJsonType, reviewQueue, isExtractingAll, processNextInReviewQueue]);

  const handlePreviewPage = (pageIndex: number) => {
    processPageAction(pageIndex, 'preview');
  };

  const handleProcessPage = (pageIndex: number) => {
    processPageAction(pageIndex, 'process');
  };

  const handlePreviewGroup = async (pageIndices: number[]) => {
    const groupPages = pageIndices.map(i => pdfPages[i]);

    pageIndices.forEach(index => {
      updatePageState(index, { isExtracting: true, extractionError: '', apiResponse: '', apiError: null });
    });

    try {
      let result;

      if (isCsvType) {
        result = await extractCsvFromMultiPagePDF({
          pdfFiles: groupPages,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          fieldMappings: currentExtractionType.fieldMappings,
          rowDetectionInstructions: currentExtractionType.csvRowDetectionInstructions,
          delimiter: currentExtractionType.csvDelimiter,
          includeHeaders: currentExtractionType.csvIncludeHeaders
        });

        const { outputData, workflowData } = separateWorkflowOnlyData(
          result,
          currentExtractionType.fieldMappings || []
        );

        pageIndices.forEach(index => {
          updatePageState(index, {
            extractedData: outputData,
            workflowOnlyData: workflowData,
            isExtracting: false
          });
        });
      } else {
        result = await extractJsonFromMultiPagePDF({
          pdfFiles: groupPages,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          formatTemplate: currentExtractionType.formatTemplate,
          fieldMappings: currentExtractionType.fieldMappings,
          parseitIdMapping: currentExtractionType.parseitIdMapping,
          traceTypeMapping: currentExtractionType.traceTypeMapping,
          traceTypeValue: currentExtractionType.traceTypeValue,
          arraySplitConfigs: currentExtractionType.arraySplitConfigs,
          arrayEntryConfigs: currentExtractionType.arrayEntryConfigs,
          functions
        });

        pageIndices.forEach(index => {
          updatePageState(index, {
            extractedData: result.templateData,
            workflowOnlyData: result.workflowOnlyData,
            isExtracting: false
          });
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      pageIndices.forEach(index => {
        updatePageState(index, {
          isExtracting: false,
          extractionError: errorMessage
        });
      });
    }
  };

  const handleProcessGroup = async (pageIndices: number[]) => {
    const groupPages = pageIndices.map(i => pdfPages[i]);

    pageIndices.forEach(index => {
      updatePageState(index, { isProcessing: true, extractionError: '', apiResponse: '', apiError: null });
    });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authHeaders = await getAuthHeaders();

    try {
      let result;

      if (isCsvType) {
        result = await extractCsvFromMultiPagePDF({
          pdfFiles: groupPages,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          fieldMappings: currentExtractionType.fieldMappings,
          rowDetectionInstructions: currentExtractionType.csvRowDetectionInstructions,
          delimiter: currentExtractionType.csvDelimiter,
          includeHeaders: currentExtractionType.csvIncludeHeaders
        });

        const { outputData, workflowData } = separateWorkflowOnlyData(
          result,
          currentExtractionType.fieldMappings || []
        );

        pageIndices.forEach(index => {
          updatePageState(index, {
            extractedData: outputData,
            workflowOnlyData: workflowData,
            isExtracting: false
          });
        });

        if (sftpConfig && sftpConfig.host) {
          try {
            await uploadToSftp({
              sftpConfig,
              xmlContent: result,
              pdfFile: groupPages[0],
              baseFilename: currentExtractionType.filename || 'combined',
              formatType: 'CSV'
            });

            pageIndices.forEach(index => {
              updatePageState(index, {
                success: true,
                isProcessing: false
              });
            });
          } catch (sftpError) {
            const errorMessage = sftpError instanceof Error ? sftpError.message : 'Unknown SFTP error';
            pageIndices.forEach(index => {
              updatePageState(index, {
                extractionError: `Failed to upload to SFTP: ${errorMessage}`,
                isProcessing: false
              });
            });
          }
        }
      } else {
        result = await extractJsonFromMultiPagePDF({
          pdfFiles: groupPages,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          formatTemplate: currentExtractionType.formatTemplate,
          fieldMappings: currentExtractionType.fieldMappings,
          parseitIdMapping: currentExtractionType.parseitIdMapping,
          traceTypeMapping: currentExtractionType.traceTypeMapping,
          traceTypeValue: currentExtractionType.traceTypeValue,
          arraySplitConfigs: currentExtractionType.arraySplitConfigs,
          arrayEntryConfigs: currentExtractionType.arrayEntryConfigs,
          functions
        });

        pageIndices.forEach(index => {
          updatePageState(index, {
            extractedData: result.templateData,
            workflowOnlyData: result.workflowOnlyData,
            isExtracting: false
          });
        });

        if (currentExtractionType.enableReview) {
          setPendingReviewData(result.templateData);
          setPendingReviewPageIndex(pageIndices[0]);
          setPendingReviewGroupIndices([...pageIndices]);
          setPendingReviewFilename(groupPages[0].name);
          setShowReviewModal(true);
          pageIndices.forEach(index => updatePageState(index, { isProcessing: false }));
          return;
        }

        const hasWorkflowGroup = currentExtractionType.workflowVersion === 'v2' ? !!currentExtractionType.workflowV2Id : !!currentExtractionType.workflowId;
        if (hasWorkflowGroup) {
          try {
            const pdfBase64 = await fileToBase64(groupPages[0]);

            const workflowResult = await executeWorkflow({
              extractedData: result.templateData,
              workflowOnlyData: result.workflowOnlyData,
              workflowId: currentExtractionType.workflowVersion === 'v2' ? currentExtractionType.workflowV2Id! : currentExtractionType.workflowId,
              userId: user?.id,
              extractionTypeId: currentExtractionType.id,
              pdfFilename: groupPages[0].name,
              pdfPages: groupPages.length,
              pdfBase64: pdfBase64,
              originalPdfFilename: groupPages[0].name,
              formatType: currentExtractionType.formatType,
              extractionTypeFilename: currentExtractionType.filename,
              workflowVersion: currentExtractionType.workflowVersion as 'v1' | 'v2' | undefined
            });

            const workflowLog = await fetchWorkflowExecutionLog(workflowResult.workflowExecutionLogId);

            pageIndices.forEach(index => {
              updatePageState(index, {
                workflowExecutionLogId: workflowResult.workflowExecutionLogId,
                apiResponse: workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse, null, 2) : JSON.stringify(workflowResult.finalData, null, 2),
                apiError: null,
                success: true,
                isProcessing: false,
                workflowExecutionLog: workflowLog,
                userMessage: workflowResult.finalData?.userMessage || undefined
              });
            });
          } catch (workflowError) {
            console.error('Workflow execution failed:', workflowError);
            const errorMessage = workflowError instanceof Error ? workflowError.message : 'Unknown workflow error';

            let workflowLog = null;
            if ((workflowError as any).workflowExecutionLogId) {
              try {
                workflowLog = await fetchWorkflowExecutionLog((workflowError as any).workflowExecutionLogId);
              } catch (fetchError) {
                console.error('Failed to fetch workflow execution log on error:', fetchError);
              }
            }

            pageIndices.forEach(index => {
              updatePageState(index, {
                extractionError: `Workflow execution failed: ${errorMessage}`,
                isProcessing: false,
                workflowExecutionLog: workflowLog
              });
            });
          }
        } else if (isJsonType) {
          // For JSON types without workflow, send directly to API
          try {
            console.log('Sending grouped JSON to API');

            // Get a fresh Parse-It ID for this submission
            let parseitId: number | undefined;
            try {
              const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_parseit_id`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({})
              });

              if (!response.ok) {
                throw new Error('Failed to get Parse-It ID');
              }

              parseitId = await response.json();
            } catch (idError) {
              console.warn('Failed to get Parse-It ID:', idError);
            }

            // Replace Parse-It ID placeholder with actual ID
            let finalJsonData = result.templateData;
            if (currentExtractionType.parseitIdMapping && parseitId) {
              finalJsonData = finalJsonData.replace(/{{PARSE_IT_ID_PLACEHOLDER}}/g, parseitId.toString());
            }

            // Update the displayed extracted data with the final data (including Parse-It ID)
            pageIndices.forEach(index => {
              updatePageState(index, {
                extractedData: finalJsonData
              });
            });

            // Strip workflow-only fields before sending to API
            let apiJsonData = finalJsonData;
            console.log('[SendToApi:GroupProcess] ==========================================');
            console.log('[SendToApi:GroupProcess] finalJsonData BEFORE WFO strip:', finalJsonData);
            const functionMappingsDbg4 = (currentExtractionType.fieldMappings || []).filter((m: any) => m.type === 'function');
            console.log('[SendToApi:GroupProcess] function-type mappings:', functionMappingsDbg4.map((m: any) => ({ fieldName: m.fieldName, functionId: m.functionId, isWorkflowOnly: !!m.isWorkflowOnly })));
            if (currentExtractionType.fieldMappings && currentExtractionType.fieldMappings.length > 0) {
              const wfoFields = currentExtractionType.fieldMappings.filter((m: any) => m.isWorkflowOnly);
              console.log('[SendToApi:GroupProcess] WFO fields being stripped:', wfoFields.map((m: any) => m.fieldName));
              if (wfoFields.length > 0) {
                const parsed = JSON.parse(finalJsonData);
                const filtered = filterOutWorkflowOnlyFields(parsed, wfoFields);
                apiJsonData = JSON.stringify(filtered);
                console.log(`Stripped ${wfoFields.length} workflow-only fields before API call`);
              }
            }
            console.log('[SendToApi:GroupProcess] apiJsonData AFTER WFO strip:', apiJsonData);
            console.log('[SendToApi:GroupProcess] ==========================================');

            // Send JSON data to API
            const apiResponseData = await sendToApi(apiJsonData, currentExtractionType);

            // Log successful API call
            try {
              await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                  user_id: user?.id || null,
                  extraction_type_id: currentExtractionType.id,
                  pdf_filename: groupPages[0].name,
                  pdf_pages: groupPages.length,
                  extraction_status: 'success',
                  error_message: null,
                  api_response: JSON.stringify(apiResponseData),
                  api_status_code: 201,
                  api_error: null,
                  extracted_data: finalJsonData,
                  created_at: new Date().toISOString()
                })
              });
            } catch (logError) {
              console.warn('Failed to log JSON extraction:', logError);
            }

            // Mark all pages in this group as successful
            pageIndices.forEach(index => {
              updatePageState(index, {
                apiResponse: JSON.stringify(apiResponseData, null, 2),
                apiError: null,
                success: true,
                isProcessing: false
              });
            });
          } catch (apiError) {
            console.error('API call failed for grouped pages:', apiError);

            // Handle API errors
            let formattedError: ApiError;
            if (apiError instanceof Error) {
              formattedError = {
                statusCode: 0,
                statusText: 'Network Error',
                details: apiError.message,
                url: apiConfig.path + (currentExtractionType?.jsonPath || ''),
                headers: {}
              };
            } else {
              formattedError = apiError as ApiError;
            }

            // Log failed API call
            try {
              await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                  user_id: user?.id || null,
                  extraction_type_id: currentExtractionType.id,
                  pdf_filename: groupPages[0].name,
                  pdf_pages: groupPages.length,
                  extraction_status: 'failed',
                  error_message: formattedError.statusCode > 0
                    ? `API Error ${formattedError.statusCode}: ${formattedError.statusText}`
                    : formattedError.details,
                  api_response: formattedError.details ? JSON.stringify(formattedError.details) : null,
                  api_status_code: formattedError.statusCode > 0 ? formattedError.statusCode : null,
                  api_error: JSON.stringify(formattedError),
                  extracted_data: result.templateData,
                  created_at: new Date().toISOString()
                })
              });
            } catch (logError) {
              console.error('Failed to log failed JSON extraction:', logError);
            }

            // Mark all pages in this group with error
            pageIndices.forEach(index => {
              updatePageState(index, {
                apiError: formattedError,
                isProcessing: false
              });
            });
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      pageIndices.forEach(index => {
        updatePageState(index, {
          isProcessing: false,
          extractionError: errorMessage
        });
      });
    }
  };

  const handleRemoveGroup = (pageIndices: number[]) => {
    const sortedIndices = [...pageIndices].sort((a, b) => b - a);
    sortedIndices.forEach(index => onRemovePage(index));
  };

  const handleExtractAll = async () => {
    if (pdfPages.length === 0) return;

    setIsExtractingAll(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authHeaders = await getAuthHeaders();

    try {
      // Check if this is multi-page CSV processing
      if (isCsvMultiPage) {
        console.log('Processing all pages as one CSV document');
        setCurrentProcessingPage(0);

        // Extract CSV from all pages combined
        const extractedData = await extractCsvFromMultiPagePDF({
          pdfFiles: pdfPages,
          defaultInstructions: currentExtractionType.defaultInstructions,
          additionalInstructions: additionalInstructions,
          fieldMappings: currentExtractionType.fieldMappings,
          rowDetectionInstructions: currentExtractionType.csvRowDetectionInstructions,
          delimiter: currentExtractionType.csvDelimiter,
          includeHeaders: currentExtractionType.csvIncludeHeaders
        });

        // Update all page states with the same extracted data
        // Separate workflow-only data
        const { outputData, workflowData } = separateWorkflowOnlyData(
          extractedData,
          currentExtractionType.fieldMappings || []
        );

        for (let i = 0; i < pdfPages.length; i++) {
          updatePageState(i, {
            extractedData: outputData,
            workflowOnlyData: workflowData,
            isExtracting: false
          });
        }

        // Upload to SFTP if configured
        if (sftpConfig && sftpConfig.host) {
          try {
            // Use the first page file for SFTP upload (filename reference)
            await uploadToSftp({
              sftpConfig,
              xmlContent: extractedData,
              pdfFile: pdfPages[0],
              baseFilename: currentExtractionType.filename || 'combined',
              formatType: 'CSV'
            });

            // Mark all pages as successful
            for (let i = 0; i < pdfPages.length; i++) {
              updatePageState(i, {
                success: true,
                isProcessing: false
              });
            }
          } catch (sftpError) {
            const errorMessage = sftpError instanceof Error ? sftpError.message : 'Unknown SFTP error';
            // Mark all pages with error
            for (let i = 0; i < pdfPages.length; i++) {
              updatePageState(i, {
                extractionError: `Failed to upload to SFTP: ${errorMessage}`,
                isProcessing: false
              });
            }
          }
        }
      } else if (isJsonMultiPage) {
        console.log('Processing JSON multi-page: grouping pages by PDF');

        // Group pages by their original PDF file name
        // Pages from the same PDF will have the same base name (without page numbers)
        const pdfGroups = new Map<string, { pages: File[], indices: number[] }>();

        pdfPages.forEach((page, index) => {
          // Extract PDF name without page number suffix
          // Pages are named like: "document_page_1.pdf", "document_page_2.pdf", etc.
          const pageName = page.name;
          const pdfName = pageName.replace(/_page_\d+\.pdf$/i, '');

          if (!pdfGroups.has(pdfName)) {
            pdfGroups.set(pdfName, { pages: [], indices: [] });
          }

          const group = pdfGroups.get(pdfName)!;
          group.pages.push(page);
          group.indices.push(index);
        });

        console.log(`Found ${pdfGroups.size} PDF groups to process`);

        // Process each PDF group separately
        let groupIndex = 0;
        for (const [pdfName, group] of pdfGroups.entries()) {
          groupIndex++;
          console.log(`Processing PDF group ${groupIndex}/${pdfGroups.size}: ${pdfName} (${group.pages.length} pages)`);
          setCurrentProcessingPage(group.indices[0]);

          try {
            // Extract JSON from all pages in this group
            const result = await extractJsonFromMultiPagePDF({
              pdfFiles: group.pages,
              defaultInstructions: currentExtractionType.defaultInstructions,
              additionalInstructions: additionalInstructions,
              formatTemplate: currentExtractionType.formatTemplate,
              fieldMappings: currentExtractionType.fieldMappings,
              parseitIdMapping: currentExtractionType.parseitIdMapping,
              traceTypeMapping: currentExtractionType.traceTypeMapping,
              traceTypeValue: currentExtractionType.traceTypeValue,
              arraySplitConfigs: currentExtractionType.arraySplitConfigs,
              arrayEntryConfigs: currentExtractionType.arrayEntryConfigs,
              functions
            });

            for (const pageIndex of group.indices) {
              updatePageState(pageIndex, {
                extractedData: result.templateData,
                workflowOnlyData: result.workflowOnlyData,
                isExtracting: false
              });
            }

            if (currentExtractionType.enableReview) {
              setPendingReviewData(result.templateData);
              setPendingReviewPageIndex(group.indices[0]);
              setPendingReviewGroupIndices([...group.indices]);
              setPendingReviewFilename(group.pages[0].name);
              setShowReviewModal(true);
              group.indices.forEach(i => updatePageState(i, { isProcessing: false }));
              setIsExtractingAll(false);
              setCurrentProcessingPage(null);
              return;
            }

            const hasWorkflowPdf = currentExtractionType.workflowVersion === 'v2' ? !!currentExtractionType.workflowV2Id : !!currentExtractionType.workflowId;
            if (hasWorkflowPdf) {
              try {
                console.log(`Executing workflow for PDF group: ${pdfName}`);

                const pdfBase64 = await fileToBase64(group.pages[0]);

                const workflowResult = await executeWorkflow({
                  extractedData: result.templateData,
                  workflowOnlyData: result.workflowOnlyData,
                  workflowId: currentExtractionType.workflowVersion === 'v2' ? currentExtractionType.workflowV2Id! : currentExtractionType.workflowId,
                  userId: user?.id,
                  extractionTypeId: currentExtractionType.id,
                  pdfFilename: group.pages[0].name,
                  pdfPages: group.pages.length,
                  pdfBase64: pdfBase64,
                  originalPdfFilename: group.pages[0].name,
                  formatType: currentExtractionType.formatType,
                  extractionTypeFilename: currentExtractionType.filename,
                  workflowVersion: currentExtractionType.workflowVersion as 'v1' | 'v2' | undefined
                });

                console.log(`Workflow execution successful for PDF group: ${pdfName}`);

                const workflowLog = await fetchWorkflowExecutionLog(workflowResult.workflowExecutionLogId);

                for (const pageIndex of group.indices) {
                  updatePageState(pageIndex, {
                    workflowExecutionLogId: workflowResult.workflowExecutionLogId,
                    apiResponse: workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse, null, 2) : JSON.stringify(workflowResult.finalData, null, 2),
                    apiError: null,
                    success: true,
                    isProcessing: false,
                    workflowExecutionLog: workflowLog,
                    userMessage: workflowResult.finalData?.userMessage || undefined
                  });
                }
              } catch (workflowError) {
                const errorMessage = workflowError instanceof Error ? workflowError.message : 'Unknown workflow error';
                console.error(`Workflow execution failed for PDF group ${pdfName}:`, errorMessage);

                let workflowLog = null;
                if ((workflowError as any).workflowExecutionLogId) {
                  try {
                    workflowLog = await fetchWorkflowExecutionLog((workflowError as any).workflowExecutionLogId);
                  } catch (fetchError) {
                    console.error('Failed to fetch workflow execution log on error:', fetchError);
                  }
                }

                for (const pageIndex of group.indices) {
                  updatePageState(pageIndex, {
                    extractionError: `Workflow execution failed: ${errorMessage}`,
                    isProcessing: false,
                    workflowExecutionLog: workflowLog
                  });
                }
              }
            } else if (isJsonType) {
              // For JSON types without workflow, send directly to API
              try {
                console.log(`🔄 Sending JSON to API for PDF group: ${pdfName}`);

                // Get a fresh Parse-It ID for this submission
                let parseitId: number | undefined;
                try {
                  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_parseit_id`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({})
                  });

                  if (!response.ok) {
                    throw new Error('Failed to get Parse-It ID');
                  }

                  parseitId = await response.json();
                } catch (idError) {
                  console.warn('Failed to get Parse-It ID:', idError);
                }

                // Replace Parse-It ID placeholder with actual ID
                let finalJsonData = result.templateData;
                if (currentExtractionType.parseitIdMapping && parseitId) {
                  finalJsonData = finalJsonData.replace(/{{PARSE_IT_ID_PLACEHOLDER}}/g, parseitId.toString());
                }

                // Update the displayed extracted data with the final data (including Parse-It ID)
                for (const pageIndex of group.indices) {
                  updatePageState(pageIndex, {
                    extractedData: finalJsonData
                  });
                }

                // Strip workflow-only fields before sending to API
                let apiJsonData = finalJsonData;
                console.log('[SendToApi:ExtractAllMultiPage] ==========================================');
                console.log('[SendToApi:ExtractAllMultiPage] group:', pdfName, 'finalJsonData BEFORE WFO strip:', finalJsonData);
                const functionMappingsDbg5 = (currentExtractionType.fieldMappings || []).filter((m: any) => m.type === 'function');
                console.log('[SendToApi:ExtractAllMultiPage] function-type mappings:', functionMappingsDbg5.map((m: any) => ({ fieldName: m.fieldName, functionId: m.functionId, isWorkflowOnly: !!m.isWorkflowOnly })));
                if (currentExtractionType.fieldMappings && currentExtractionType.fieldMappings.length > 0) {
                  const wfoFields = currentExtractionType.fieldMappings.filter((m: any) => m.isWorkflowOnly);
                  console.log('[SendToApi:ExtractAllMultiPage] WFO fields being stripped:', wfoFields.map((m: any) => m.fieldName));
                  if (wfoFields.length > 0) {
                    const parsed = JSON.parse(finalJsonData);
                    const filtered = filterOutWorkflowOnlyFields(parsed, wfoFields);
                    apiJsonData = JSON.stringify(filtered);
                    console.log(`Stripped ${wfoFields.length} workflow-only fields before API call`);
                  }
                }
                console.log('[SendToApi:ExtractAllMultiPage] apiJsonData AFTER WFO strip:', apiJsonData);
                console.log('[SendToApi:ExtractAllMultiPage] ==========================================');

                // Send JSON data to API
                const apiResponseData = await sendToApi(apiJsonData, currentExtractionType);

                // Log successful API call
                try {
                  await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                      user_id: user?.id || null,
                      extraction_type_id: currentExtractionType.id,
                      pdf_filename: group.pages[0].name,
                      pdf_pages: group.pages.length,
                      extraction_status: 'success',
                      error_message: null,
                      api_response: JSON.stringify(apiResponseData),
                      api_status_code: 201,
                      api_error: null,
                      extracted_data: finalJsonData,
                      created_at: new Date().toISOString()
                    })
                  });
                } catch (logError) {
                  console.warn('Failed to log JSON extraction:', logError);
                }

                console.log(`✅ API call successful for PDF group: ${pdfName}`);

                // Mark all pages in this group as successful
                for (const pageIndex of group.indices) {
                  updatePageState(pageIndex, {
                    apiResponse: JSON.stringify(apiResponseData, null, 2),
                    apiError: null,
                    success: true,
                    isProcessing: false
                  });
                }
              } catch (apiError) {
                console.error(`❌ API call failed for PDF group ${pdfName}:`, apiError);

                // Handle API errors
                let formattedError: ApiError;
                if (apiError instanceof Error) {
                  formattedError = {
                    statusCode: 0,
                    statusText: 'Network Error',
                    details: apiError.message,
                    url: apiConfig.path + (currentExtractionType?.jsonPath || ''),
                    headers: {}
                  };
                } else {
                  formattedError = apiError as ApiError;
                }

                // Log failed API call
                try {
                  await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                      user_id: user?.id || null,
                      extraction_type_id: currentExtractionType.id,
                      pdf_filename: group.pages[0].name,
                      pdf_pages: group.pages.length,
                      extraction_status: 'failed',
                      error_message: formattedError.statusCode > 0
                        ? `API Error ${formattedError.statusCode}: ${formattedError.statusText}`
                        : formattedError.details,
                      api_response: formattedError.details ? JSON.stringify(formattedError.details) : null,
                      api_status_code: formattedError.statusCode > 0 ? formattedError.statusCode : null,
                      api_error: JSON.stringify(formattedError),
                      extracted_data: result.templateData,
                      created_at: new Date().toISOString()
                    })
                  });
                } catch (logError) {
                  console.error('Failed to log failed JSON extraction:', logError);
                }

                // Mark all pages in this group with error
                for (const pageIndex of group.indices) {
                  updatePageState(pageIndex, {
                    apiError: formattedError,
                    isProcessing: false
                  });
                }
              }
            }

            // Add delay between PDF groups
            if (groupIndex < pdfGroups.size) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (extractionError) {
            const errorMessage = extractionError instanceof Error ? extractionError.message : 'Unknown extraction error';
            console.error(`❌ Extraction failed for PDF group ${pdfName}:`, errorMessage);

            // Mark all pages in this group with error
            for (const pageIndex of group.indices) {
              updatePageState(pageIndex, {
                extractionError: `Extraction failed: ${errorMessage}`,
                isProcessing: false
              });
            }
          }
        }
      } else {
        if (currentExtractionType.enableReview) {
          setReviewQueue(Array.from({ length: pdfPages.length }, (_, i) => i));
          setCurrentProcessingPage(0);
          await processPageAction(0, 'process');
        } else {
          for (let pageIndex = 0; pageIndex < pdfPages.length; pageIndex++) {
            setCurrentProcessingPage(pageIndex);
            console.log(`Extract All: Processing page ${pageIndex + 1} of ${pdfPages.length}`);
            await processPageAction(pageIndex, 'process');
            if (pageIndex < pdfPages.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }
    } catch (workflowError) {
      console.error('Workflow execution failed:', workflowError);
      const errorMessage = workflowError instanceof Error ? workflowError.message : 'Unknown workflow error';
      console.error('Detailed workflow error:', errorMessage);
    } finally {
      if (!currentExtractionType.enableReview || isCsvMultiPage || isJsonMultiPage) {
        setIsExtractingAll(false);
        setCurrentProcessingPage(null);
      }
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get just the base64 data
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

  const getPageGroups = () => {
    if (!isJsonMultiPage && !isCsvMultiPage) {
      return null;
    }

    const groups = new Map<string, {
      pages: File[];
      indices: number[];
      pageStart: number;
      pageEnd: number;
    }>();

    pdfPages.forEach((page, index) => {
      const baseName = page.name.replace(/_page_\d+\.pdf$/i, '');

      if (!groups.has(baseName)) {
        groups.set(baseName, {
          pages: [],
          indices: [],
          pageStart: index + 1,
          pageEnd: index + 1
        });
      }

      const group = groups.get(baseName)!;
      group.pages.push(page);
      group.indices.push(index);
      group.pageEnd = index + 1;
    });

    return groups;
  };

  const pageGroups = getPageGroups();

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
          PDF Pages ({pdfPages.length} page{pdfPages.length !== 1 ? 's' : ''})
        </label>
        <button
          onClick={handleExtractAll}
          disabled={!currentExtractionType || isExtractingAll}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
        >
          {isExtractingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Processing Page {currentProcessingPage !== null ? currentProcessingPage + 1 : '...'} of {pdfPages.length}
              </span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Extract All</span>
            </>
          )}
        </button>
      </div>
      <div className="space-y-4">
        {pageGroups ? (
          Array.from(pageGroups.entries()).map(([pdfName, group], groupIndex) => {
            const groupStates = group.indices.map(i => pageProcessingStates[i]);
            const isGroupExtracting = groupStates.some(s => s?.isExtracting);
            const isGroupProcessing = groupStates.some(s => s?.isProcessing);
            const groupExtractedData = groupStates[0]?.extractedData || '';
            const groupError = groupStates.find(s => s?.extractionError)?.extractionError || '';
            const groupSuccess = groupStates.every(s => s?.success);

            return (
              <PageGroupCard
                key={`group-${groupIndex}`}
                pdfName={pdfName}
                pages={group.pages}
                pageIndices={group.indices}
                pageRange={group.pageStart === group.pageEnd ? `Page ${group.pageStart}` : `Pages ${group.pageStart}-${group.pageEnd}`}
                isExtracting={isGroupExtracting}
                isProcessing={isGroupProcessing}
                extractedData={groupExtractedData}
                extractionError={groupError}
                success={groupSuccess}
                pageStates={groupStates}
                isExtractingAll={isExtractingAll}
                isJsonType={isJsonType}
                isCsvType={isCsvType}
                currentExtractionType={currentExtractionType}
                workflowSteps={workflowSteps}
                onPreview={handlePreviewGroup}
                onProcess={handleProcessGroup}
                onRemove={handleRemoveGroup}
              />
            );
          })
        ) : (
          pdfPages.map((pageFile, pageIndex) => (
            <PageProcessorCard
              key={pageIndex}
              pageFile={pageFile}
              pageIndex={pageIndex}
              pageState={pageProcessingStates[pageIndex] || {
                isProcessing: false,
                isExtracting: false,
                extractedData: '',
                workflowOnlyData: '',
                extractionError: '',
                apiResponse: '',
                apiError: null,
                success: false
              }}
              isExtractingAll={isExtractingAll}
              isJsonType={isJsonType}
              workflowSteps={workflowSteps}
              currentExtractionType={currentExtractionType}
              onPreview={handlePreviewPage}
              onProcess={handleProcessPage}
              onRemove={onRemovePage}
            />
          ))
        )}
      </div>

      <AiReviewModal
        isOpen={showReviewModal}
        onClose={() => { setShowReviewModal(false); if (pendingReviewGroupIndices) { pendingReviewGroupIndices.forEach(i => updatePageState(i, { isProcessing: false })); } else if (pendingReviewPageIndex !== null) { updatePageState(pendingReviewPageIndex, { isProcessing: false }); } setPendingReviewPageIndex(null); setPendingReviewGroupIndices(null); setReviewQueue([]); setIsExtractingAll(false); setCurrentProcessingPage(null); }}
        onConfirm={handleReviewConfirm}
        extractedData={pendingReviewData}
        confidenceScores={reviewConfidenceScores}
        formatType={currentExtractionType.formatType as 'JSON' | 'XML' | 'CSV'}
        extractionTypeName={currentExtractionType.name}
        pdfFilename={pendingReviewFilename}
        pdfFile={pendingReviewPageIndex !== null ? pdfPages[pendingReviewPageIndex] : undefined}
        fieldMappings={currentExtractionType.fieldMappings}
      />
    </div>
  );
}