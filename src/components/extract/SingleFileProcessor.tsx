import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Send, Download, X, Loader2, Copy } from 'lucide-react';
import type { ExtractionType, SftpConfig, SettingsConfig, ApiConfig, User, ApiError, WorkflowStep, WorkflowExecutionLog, FieldMappingFunction } from '../../types';
import { extractDataFromPDF } from '../../lib/gemini';
import { uploadToSftp } from '../../lib/sftp';
import { executeWorkflow } from '../../lib/workflow';
import { sendToApi } from '../../lib/apiClient';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';
import { getAuthHeaders } from '../../lib/supabase';
import AiReviewModal from './AiReviewModal';

interface SingleFileProcessorProps {
  uploadedFile: File;
  currentExtractionType: ExtractionType;
  additionalInstructions: string;
  sftpConfig: SftpConfig;
  settingsConfig: SettingsConfig;
  apiConfig: ApiConfig;
  user: User | null;
  workflowSteps: WorkflowStep[];
}

export default function SingleFileProcessor({
  uploadedFile,
  currentExtractionType,
  additionalInstructions,
  sftpConfig,
  settingsConfig,
  apiConfig,
  user,
  workflowSteps
}: SingleFileProcessorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState('');
  const [workflowOnlyData, setWorkflowOnlyData] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [apiResponse, setApiResponse] = useState('');
  const [apiResponseError, setApiResponseError] = useState<ApiError | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [workflowExecutionLogId, setWorkflowExecutionLogId] = useState<string>('');
  const [workflowExecutionLog, setWorkflowExecutionLog] = useState<WorkflowExecutionLog | null>(null);
  const [functions, setFunctions] = useState<FieldMappingFunction[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [confidenceScores, setConfidenceScores] = useState<Record<string, number> | undefined>();
  const [pendingReviewData, setPendingReviewData] = useState<string>('');

  const isJsonType = currentExtractionType?.formatType === 'JSON';

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
  const previewButtonText = 'Preview Mappings';
  const dataLabel = isJsonType ? 'JSON' : 'XML';

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

    const workflowOnlyFields = fieldMappings.filter(m => m.isWorkflowOnly);

    if (workflowOnlyFields.length === 0) {
      return { outputData: extractedData, workflowData: '{}' };
    }

    try {
      const parsed = JSON.parse(extractedData);
      const wfoFieldNames = workflowOnlyFields.map(m => m.fieldName);
      const nonWfoFieldNames = fieldMappings
        .filter(m => !m.isWorkflowOnly)
        .map(m => m.fieldName);

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

  const handlePreviewData = async () => {
    if (!uploadedFile || !currentExtractionType) return;
    
    setIsExtracting(true);
    setExtractionError('');
    setExtractedData('');
    
    try {
      const result = await extractDataFromPDF({
        pdfFile: uploadedFile,
        defaultInstructions: currentExtractionType.defaultInstructions,
        additionalInstructions: additionalInstructions,
        formatTemplate: currentExtractionType.formatTemplate,
        formatType: currentExtractionType.formatType,
        fieldMappings: currentExtractionType.fieldMappings,
        parseitIdMapping: currentExtractionType.parseitIdMapping,
        arraySplitConfigs: currentExtractionType.arraySplitConfigs,
        arrayEntryConfigs: currentExtractionType.arrayEntryConfigs,
        functions
      });

      // Separate workflow-only data
      const { outputData, workflowData } = separateWorkflowOnlyData(
        result,
        currentExtractionType.fieldMappings || []
      );
      setExtractedData(outputData);
      setWorkflowOnlyData(workflowData);
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : 'Failed to extract data');
    } finally {
      setIsExtracting(false);
    }
  };

  const proceedWithSend = async (dataToSend: string) => {
    try {
      const hasWorkflow = currentExtractionType.workflowVersion === 'v2' ? !!currentExtractionType.workflowV2Id : !!currentExtractionType.workflowId;
      if (hasWorkflow) {
        try {
          console.log('Starting workflow execution for single file');
          console.log('Workflow ID:', currentExtractionType.workflowId);
          console.log('User ID:', user?.id);
          console.log('Extraction Type ID:', currentExtractionType.id);
          console.log('Extracted data length:', dataToSend.length);

          // Convert PDF to base64 for workflow
          const pdfBase64 = await fileToBase64(uploadedFile);

          const workflowResult = await executeWorkflow({
            extractedData: dataToSend,
            workflowOnlyData: workflowOnlyData || '{}',
            workflowId: currentExtractionType.workflowVersion === 'v2' ? currentExtractionType.workflowV2Id! : currentExtractionType.workflowId,
            userId: user?.id,
            extractionTypeId: currentExtractionType.id,
            pdfFilename: uploadedFile.name,
            pdfPages: 1,
            pdfBase64: pdfBase64,
            originalPdfFilename: uploadedFile.name,
            formatType: currentExtractionType.formatType,
            extractionTypeFilename: currentExtractionType.filename,
            workflowVersion: currentExtractionType.workflowVersion as 'v1' | 'v2' | undefined
          });
          
          console.log('Workflow execution completed successfully:', workflowResult);
          
          // Store the workflow execution log ID for status tracking
          setWorkflowExecutionLogId(workflowResult.workflowExecutionLogId);
          
          // Fetch the complete workflow execution log
          const workflowLog = await fetchWorkflowExecutionLog(workflowResult.workflowExecutionLogId);
          setWorkflowExecutionLog(workflowLog);
          
          setApiResponse(workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse, null, 2) : JSON.stringify(workflowResult.finalData, null, 2));
          setApiResponseError(null);
          setSendSuccess(true);
        } catch (workflowError) {
          console.error('Workflow execution failed:', workflowError);
          const errorMessage = workflowError instanceof Error ? workflowError.message : 'Unknown workflow error';
          console.error('Detailed workflow error:', errorMessage);
          
          // Check if the error contains a workflow execution log ID
          if ((workflowError as any).workflowExecutionLogId) {
            try {
              const workflowLog = await fetchWorkflowExecutionLog((workflowError as any).workflowExecutionLogId);
              setWorkflowExecutionLog(workflowLog);
            } catch (fetchError) {
              console.error('Failed to fetch workflow execution log on error:', fetchError);
            }
          }
          
          setExtractionError(`Workflow execution failed: ${errorMessage}`);
          setApiResponseError({
            statusCode: 500,
            statusText: 'Workflow Error',
            details: errorMessage
          });
        }
        return; // Exit after workflow execution
      }

      if (isJsonType) {
        // For JSON types, get Parse-It ID and inject it before sending to API
        let parseitId: number | undefined;
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const authHeaders = await getAuthHeaders();

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
          let finalJsonData = dataToSend;
          if (currentExtractionType.parseitIdMapping && parseitId) {
            finalJsonData = finalJsonData.replace(/{{PARSE_IT_ID_PLACEHOLDER}}/g, parseitId.toString());
          }
          
          // Update the displayed extracted data with the final data (including Parse-It ID)
          setExtractedData(finalJsonData);

          // Strip workflow-only fields before sending to API
          let apiJsonData = finalJsonData;
          console.log('[SendToApi:SingleFile] ==========================================');
          console.log('[SendToApi:SingleFile] finalJsonData BEFORE WFO strip:', finalJsonData);
          const functionMappingsDbg = (currentExtractionType.fieldMappings || []).filter((m: any) => m.type === 'function');
          console.log('[SendToApi:SingleFile] function-type mappings:', functionMappingsDbg.map((m: any) => ({ fieldName: m.fieldName, functionId: m.functionId, isWorkflowOnly: !!m.isWorkflowOnly })));
          if (currentExtractionType.fieldMappings && currentExtractionType.fieldMappings.length > 0) {
            const wfoFields = currentExtractionType.fieldMappings.filter((m: any) => m.isWorkflowOnly);
            console.log('[SendToApi:SingleFile] WFO fields being stripped:', wfoFields.map((m: any) => m.fieldName));
            if (wfoFields.length > 0) {
              const parsed = JSON.parse(finalJsonData);
              const filtered = filterOutWorkflowOnlyFields(parsed, wfoFields);
              apiJsonData = JSON.stringify(filtered);
              console.log(`Stripped ${wfoFields.length} workflow-only fields before API call`);
            }
          }
          console.log('[SendToApi:SingleFile] apiJsonData AFTER WFO strip:', apiJsonData);
          console.log('[SendToApi:SingleFile] ==========================================');

          // Send JSON data to API with Parse-It ID (WFO fields excluded)
          const apiResponseData = await sendToApi(apiJsonData, currentExtractionType);
          
          setApiResponse(JSON.stringify(apiResponseData, null, 2));
          setApiResponseError(null);
          
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
                pdf_filename: uploadedFile.name,
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
          // Log failed API call
          try {
            console.log('Logging failed JSON extraction:', apiError);
            await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                user_id: user?.id || null,
                extraction_type_id: currentExtractionType.id,
                pdf_filename: uploadedFile.name,
                pdf_pages: 1,
                extraction_status: 'failed',
                error_message: apiError instanceof Error ? apiError.message : `API Error ${(apiError as ApiError).statusCode}: ${(apiError as ApiError).statusText}`,
                api_response: apiError instanceof Error ? null : JSON.stringify((apiError as ApiError).details),
                api_status_code: apiError instanceof Error ? null : (apiError as ApiError).statusCode,
                api_error: apiError instanceof Error ? apiError.message : JSON.stringify(apiError),
                extracted_data: dataToSend,
                created_at: new Date().toISOString()
              })
            });
          } catch (logError) {
            console.error('Failed to log failed JSON extraction:', logError);
          }
          throw apiError;
        }
        
        // Also upload PDF to SFTP for JSON types
        try {
          await uploadToSftp({
            sftpConfig,
            xmlContent: dataToSend,
            pdfFile: uploadedFile,
            baseFilename: currentExtractionType.filename || 'document',
            parseitIdMapping: currentExtractionType.parseitIdMapping,
            useExistingParseitId: parseitId,
            userId: user?.id,
            extractionTypeId: currentExtractionType.id,
            customFilenamePart
          });
        } catch (sftpError) {
          console.warn('PDF upload to SFTP failed for JSON type:', sftpError);
          // Don't throw error here - API call was successful, SFTP is secondary
        }
      } else {
        // Upload XML files to SFTP
        await uploadToSftp({
          sftpConfig,
          xmlContent: dataToSend,
          pdfFile: uploadedFile,
          baseFilename: currentExtractionType.filename || 'document',
          parseitIdMapping: currentExtractionType.parseitIdMapping,
          userId: user?.id,
          extractionTypeId: currentExtractionType.id,
          formatType: currentExtractionType.formatType
        });
      }
      
      setSendSuccess(true);
    } catch (error) {
      if (isJsonType) {
        if (error instanceof Error) {
          setApiResponseError({
            statusCode: 0,
            statusText: 'Network Error',
            details: error.message,
            url: apiConfig.path + (currentExtractionType?.jsonPath || ''),
            headers: {}
          });
        } else {
          setApiResponseError(error as ApiError);
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setExtractionError(`Failed to upload to SFTP: ${errorMessage}`);
      }
      console.error('Extract and send error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtractAndSend = async () => {
    if (!uploadedFile || !currentExtractionType) return;

    setIsProcessing(true);
    setSendSuccess(false);
    setExtractionError('');
    setApiResponse('');
    setApiResponseError(null);

    try {
      let dataToSend = extractedData;

      if (!dataToSend) {
        const extractResult = await extractDataFromPDF({
          pdfFile: uploadedFile,
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
          enableConfidenceScoring: currentExtractionType.enableConfidenceScoring
        });
        dataToSend = extractResult.templateData;
        setExtractedData(dataToSend);

        const { outputData, workflowData } = separateWorkflowOnlyData(
          extractResult.templateData,
          currentExtractionType.fieldMappings || []
        );
        dataToSend = outputData;
        setExtractedData(outputData);
        setWorkflowOnlyData(workflowData);

        if (extractResult.confidenceScores) {
          setConfidenceScores(extractResult.confidenceScores);
        }
      }

      if (currentExtractionType.enableReview) {
        setPendingReviewData(dataToSend);
        setShowReviewModal(true);
        setIsProcessing(false);
        return;
      }

      await proceedWithSend(dataToSend);
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : 'Failed to extract data');
      setIsProcessing(false);
    }
  };

  const handleReviewConfirm = async (editedData: string) => {
    setShowReviewModal(false);
    setExtractedData(editedData);
    setIsProcessing(true);
    try {
      await proceedWithSend(editedData);
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : 'Failed to send data');
      setIsProcessing(false);
    }
  };

  const handleDownloadData = () => {
    if (!extractedData) return;
    
    const mimeType = isJsonType ? 'application/json' : 'application/xml';
    const fileExtension = isJsonType ? 'json' : 'xml';
    
    const blob = new Blob([extractedData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted-data-${Date.now()}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    if (!extractedData) return;
    
    try {
      await navigator.clipboard.writeText(extractedData);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = extractedData;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const clearExtractedData = () => {
    setExtractedData('');
    setWorkflowOnlyData('');
    setExtractionError('');
    setCopySuccess(false);
    setWorkflowExecutionLogId('');
    setWorkflowExecutionLog(null);
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

  // Get workflow steps for the current extraction type
  const currentWorkflowSteps = workflowSteps
    .filter(step => step.workflowId === currentExtractionType.workflowId)
    .sort((a, b) => a.stepOrder - b.stepOrder);

  const getStepStatus = (step: WorkflowStep): 'pending' | 'running' | 'completed' | 'failed' => {
    if (!workflowExecutionLog) return 'pending';
    
    if (workflowExecutionLog.status === 'completed') {
      return 'completed';
    }
    
    if (workflowExecutionLog.status === 'failed') {
      if (step.id === workflowExecutionLog.currentStepId) {
        return 'failed';
      }
      // Steps before the failed step are completed
      const currentStepOrder = workflowSteps.find(s => s.id === workflowExecutionLog.currentStepId)?.stepOrder || 0;
      return step.stepOrder < currentStepOrder ? 'completed' : 'pending';
    }
    
    if (workflowExecutionLog.status === 'running') {
      if (step.id === workflowExecutionLog.currentStepId) {
        return 'running';
      }
      const currentStepOrder = workflowSteps.find(s => s.id === workflowExecutionLog.currentStepId)?.stepOrder || 0;
      return step.stepOrder < currentStepOrder ? 'completed' : 'pending';
    }
    
    return 'pending';
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 text-white';
      case 'running':
        return 'bg-blue-500 text-white animate-pulse';
      case 'failed':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-300 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Single file action buttons */}
      <div className="flex flex-wrap gap-4">
        <button
          onClick={handlePreviewData}
          disabled={!uploadedFile || !currentExtractionType || isExtracting}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
        >
          {isExtracting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Extracting...</span>
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              <span>{previewButtonText}</span>
            </>
          )}
        </button>
        
        <button
          onClick={handleExtractAndSend}
          disabled={!uploadedFile || !currentExtractionType || isProcessing}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Extract & {isJsonType ? 'Send to API' : 'Upload via SFTP'}</span>
            </>
          )}
        </button>
      </div>

      {/* Success Message */}
      {sendSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800">Success!</span>
          </div>
          <p className="text-green-700 text-sm mt-1">
            Data extracted and {isJsonType ? 'sent to API' : 'uploaded via SFTP'} successfully!
          </p>
        </div>
      )}

      {/* API Response for JSON types - Success only */}
      {isJsonType && apiResponse && !apiResponseError && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            <span className="font-semibold text-blue-800">API Response</span>
          </div>
          <div className="bg-white rounded-lg p-4 border max-h-64 overflow-y-auto">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
              {apiResponse}
            </pre>
          </div>
        </div>
      )}

      {/* JSON API Error Status Box */}
      {isJsonType && apiResponseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800">
              API Error {apiResponseError.statusCode > 0 ? `${apiResponseError.statusCode}` : ''}
            </span>
          </div>
          
          <div className="space-y-3">
            {/* Status and URL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-red-800">Status:</span>
                <p className="text-red-700">
                  {apiResponseError.statusCode > 0 
                    ? `${apiResponseError.statusCode} ${apiResponseError.statusText}`
                    : apiResponseError.statusText
                  }
                </p>
              </div>
              {apiResponseError.url && (
                <div>
                  <span className="font-medium text-red-800">URL:</span>
                  <p className="text-red-700 break-all">{apiResponseError.url}</p>
                </div>
              )}
            </div>

            {/* Response Details */}
            {apiResponseError.details && (
              <div>
                <span className="font-medium text-red-800 block mb-2">Response Details:</span>
                <div className="bg-white rounded-lg p-3 border border-red-300 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-red-800 whitespace-pre-wrap font-mono">
                    {typeof apiResponseError.details === 'string' 
                      ? apiResponseError.details 
                      : JSON.stringify(apiResponseError.details, null, 2)
                    }
                  </pre>
                </div>
              </div>
            )}

            {/* Response Headers */}
            {apiResponseError.headers && Object.keys(apiResponseError.headers).length > 0 && (
              <div>
                <span className="font-medium text-red-800 block mb-2">Response Headers:</span>
                <div className="bg-white rounded-lg p-3 border border-red-300 max-h-32 overflow-y-auto">
                  <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                    {JSON.stringify(apiResponseError.headers, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            <p className="text-red-600 text-xs mt-3">
              Please check your API configuration, endpoint URL, and JSON data format.
            </p>
          </div>
        </div>
      )}

      {/* Extraction Error Display */}
      {extractionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800">Extraction Error</span>
          </div>
          <p className="text-red-700 text-sm">{extractionError}</p>
          {extractionError.includes('503') && extractionError.toLowerCase().includes('overloaded') ? (
            <p className="text-red-600 text-xs mt-2">
              The AI service is temporarily overloaded. Please wait a moment and try again.
            </p>
          ) : (
            <p className="text-red-600 text-xs mt-2">
              Please check your PDF file and try again. Make sure you have configured your Gemini API key.
            </p>
          )}
        </div>
      )}

      {/* Workflow Steps Display for Single File */}
      {currentExtractionType.workflowId && currentWorkflowSteps.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Workflow Progress</h3>
                <p className="text-gray-600 mt-1">
                  {currentWorkflowSteps.length} step{currentWorkflowSteps.length !== 1 ? 's' : ''} in workflow
                </p>
              </div>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="p-6">
            <div className="space-y-4">
              {currentWorkflowSteps.map((step, index) => {
                const status = getStepStatus(step);
                return (
                  <div key={step.id} className="flex items-center space-x-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getStepStatusColor(status)}`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{step.name}</h4>
                      <p className="text-sm text-gray-600">{step.description}</p>
                    </div>
                    <div className="text-sm font-medium capitalize text-gray-600">
                      {status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Split Screen Preview Display */}
      {extractedData && (
        <div className="space-y-4">
          {/* Action Buttons Row */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={handleCopyToClipboard}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownloadData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Download</span>
            </button>
            <button
              onClick={clearExtractedData}
              className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <X className="h-4 w-4" />
              <span>Clear</span>
            </button>
          </div>

          {/* Split Screen Grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Regular Output Data */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Output Data</h3>
                <p className="text-gray-600 mt-1">Fields sent to API/SFTP</p>
              </div>
              <div className="p-6">
                <div className="bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                    {extractedData}
                  </pre>
                </div>
              </div>
            </div>

            {/* Workflow Only Data */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-green-100 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Workflow Only Data</h3>
                <p className="text-gray-600 mt-1">Fields available for workflow processing</p>
              </div>
              <div className="p-6">
                <div className="bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">
                  {workflowOnlyData === '{}' ? (
                    <p className="text-gray-500 italic">No workflow-only fields configured</p>
                  ) : (
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                      {workflowOnlyData}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AiReviewModal
        isOpen={showReviewModal}
        onClose={() => { setShowReviewModal(false); setIsProcessing(false); }}
        onConfirm={handleReviewConfirm}
        extractedData={pendingReviewData}
        confidenceScores={confidenceScores}
        formatType={currentExtractionType.formatType as 'JSON' | 'XML' | 'CSV'}
        extractionTypeName={currentExtractionType.name}
        pdfFilename={uploadedFile.name}
        pdfFile={uploadedFile}
        fieldMappings={currentExtractionType.fieldMappings}
      />
    </div>
  );
}