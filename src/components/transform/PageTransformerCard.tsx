import React, { useState } from 'react';
import { FileText, Send, Loader2, Copy, CheckCircle, XCircle, Eye, Database, AlertTriangle, X } from 'lucide-react';
import type { TransformationType, SftpConfig, SettingsConfig, ApiConfig, User, WorkflowStep, WorkflowExecutionLog, PageGroupConfig } from '../../types';
import Modal from '../common/Modal';
import { supabase, getAuthHeaders } from '../../lib/supabase';
import { executeTransformWorkflowV2 } from '../../lib/workflowV2';

interface PageTransformerCardProps {
  pageFile: File;
  pageIndex: number;
  transformationType: TransformationType;
  additionalInstructions: string;
  sftpConfig: SftpConfig;
  settingsConfig: SettingsConfig;
  apiConfig: ApiConfig;
  user: User | null;
  workflowSteps: WorkflowStep[];
  isTransformingAll: boolean;
  pageGroupConfig?: PageGroupConfig;
  onProcessStart: (pageIndex: number) => void;
  onProcessComplete: (pageIndex: number, result: any) => void;
  hidePreview?: boolean;
}

export default function PageTransformerCard({
  pageFile,
  pageIndex,
  transformationType,
  additionalInstructions,
  sftpConfig,
  settingsConfig,
  apiConfig,
  user,
  workflowSteps,
  isTransformingAll,
  pageGroupConfig,
  onProcessStart,
  onProcessComplete,
  hidePreview = false
}: PageTransformerCardProps) {
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformResult, setTransformResult] = useState<{
    extractedData: any;
    extractedDataJson?: string;
    newFilename: string;
    success: boolean;
    error?: string;
  } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [workflowExecutionLogId, setWorkflowExecutionLogId] = useState<string>('');
  const [workflowExecutionLog, setWorkflowExecutionLog] = useState<WorkflowExecutionLog | null>(null);
  const [isPollingWorkflowLog, setIsPollingWorkflowLog] = useState(false);

  // Extract page range from filename for display
  const getPageDisplayName = (filename: string): string => {
    const groupMatch = filename.match(/_group_\d+_pages_(\d+-\d+)\.pdf$/);
    if (groupMatch) {
      const groupLabel = pageGroupConfig?.name ? `${pageGroupConfig.name}` : `Group ${pageIndex + 1}`;
      return `${groupLabel} (Pages ${groupMatch[1]})`;
    }
    
    // Check if filename contains single page like "_page_1.pdf"
    const pageMatch = filename.match(/_page_(\d+)\.pdf$/);
    if (pageMatch) {
      return `Page ${pageMatch[1]}`;
    }
    
    // Fallback to page index + 1
    return `Page ${pageIndex + 1}`;
  };

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);

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

  const fetchWorkflowExecutionLog = async (logId: string, tableName = 'workflow_execution_logs'): Promise<WorkflowExecutionLog | null> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?id=eq.${logId}`, {
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

  const startPollingWorkflowLog = (logId: string, tableName = 'workflow_execution_logs') => {
    if (isPollingWorkflowLog) return;

    setIsPollingWorkflowLog(true);
    const pollInterval = setInterval(async () => {
      const log = await fetchWorkflowExecutionLog(logId, tableName);
      if (log) {
        setWorkflowExecutionLog(log);
        if (log.status === 'completed' || log.status === 'failed') {
          clearInterval(pollInterval);
          setIsPollingWorkflowLog(false);
        }
      }
    }, 2000);
  };

  const handlePreviewTransform = async () => {
    if (!pageFile || !transformationType) return;
    
    onProcessStart(pageIndex);
    setIsTransforming(true);
    setTransformResult(null);
    setWorkflowExecutionLog(null);
    
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const pdfBase64 = await fileToBase64(pageFile);

      const effectiveTransformationType = pageGroupConfig
        ? {
            ...transformationType,
            ...(pageGroupConfig.fieldMappings && { fieldMappings: pageGroupConfig.fieldMappings }),
            ...(pageGroupConfig.filenameTemplate && { filenameTemplate: pageGroupConfig.filenameTemplate })
          }
        : transformationType;

      const response = await fetch(`${supabaseUrl}/functions/v1/pdf-transformer`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          pdfBase64,
          transformationType: effectiveTransformationType,
          additionalInstructions
        })
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
          throw new Error(errorData.details || errorData.error || 'Transformation failed');
        } catch (parseError) {
          const errorText = await response.text();
          throw new Error(`Transformation failed (${response.status}): ${errorText || 'Unknown error'}`);
        }
      }

      let result;
      try {
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          throw new Error('PDF transformer returned an empty response. This usually means the AI had trouble extracting data from your PDF. Please try with a clearer PDF or adjust your transformation instructions.');
        }
        result = JSON.parse(responseText);
      } catch (parseError) {
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          throw new Error('PDF transformer returned an empty response. This usually means the AI had trouble extracting data from your PDF. Please try with a clearer PDF or adjust your transformation instructions.');
        } else {
          throw new Error(`PDF transformer returned invalid JSON. This usually means the AI had trouble processing your PDF. Response preview: "${responseText.substring(0, 200)}". Please try with a clearer PDF or adjust your transformation instructions.`);
        }
      }
      
      setTransformResult({
        extractedData: result.extractedData,
        extractedDataJson: JSON.stringify(result.extractedData, null, 2),
        newFilename: result.newFilename,
        success: true
      });
      onProcessComplete(pageIndex, { success: true, newFilename: result.newFilename });
      
    } catch (error) {
      setTransformResult({
        extractedData: {},
        newFilename: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      onProcessComplete(pageIndex, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleTransformAndUpload = async () => {
    if (!pageFile || !transformationType) return;

    onProcessStart(pageIndex);
    setIsTransforming(true);

    try {
      let resultToUse = transformResult;
      let pdfBase64: string;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      if (!resultToUse?.success) {
        pdfBase64 = await fileToBase64(pageFile);

        const effectiveTransformationType = pageGroupConfig
          ? {
              ...transformationType,
              ...(pageGroupConfig.fieldMappings && { fieldMappings: pageGroupConfig.fieldMappings }),
              ...(pageGroupConfig.filenameTemplate && { filenameTemplate: pageGroupConfig.filenameTemplate })
            }
          : transformationType;

        const response = await fetch(`${supabaseUrl}/functions/v1/pdf-transformer`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            pdfBase64,
            transformationType: effectiveTransformationType,
            additionalInstructions
          })
        });

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
            throw new Error(errorData.details || errorData.error || 'Transformation failed');
          } catch (parseError) {
            const errorText = await response.text();
            throw new Error(`Transformation failed (${response.status}): ${errorText || 'Unknown error'}`);
          }
        }

        let result;
        try {
          const responseText = await response.text();
          if (!responseText || responseText.trim() === '') {
            throw new Error('PDF transformer returned an empty response. This usually means the AI had trouble extracting data from your PDF. Please try with a clearer PDF or adjust your transformation instructions.');
          }
          result = JSON.parse(responseText);
        } catch (parseError) {
          const responseText = await response.text();
          if (!responseText || responseText.trim() === '') {
            throw new Error('PDF transformer returned an empty response. This usually means the AI had trouble extracting data from your PDF. Please try with a clearer PDF or adjust your transformation instructions.');
          } else {
            throw new Error(`PDF transformer returned invalid JSON. This usually means the AI had trouble processing your PDF. Response preview: "${responseText.substring(0, 200)}". Please try with a clearer PDF or adjust your transformation instructions.`);
          }
        }
        
        resultToUse = {
          extractedData: result.extractedData,
          extractedDataJson: JSON.stringify(result.extractedData, null, 2),
          newFilename: result.newFilename,
          success: false
        };

        setTransformResult(resultToUse);
      } else {
        pdfBase64 = await fileToBase64(pageFile);
      }

      const activeWorkflowVersion = pageGroupConfig?.workflowVersion || transformationType.workflowVersion || 'v1';
      const activeWorkflowId = activeWorkflowVersion === 'v2'
        ? (pageGroupConfig?.workflowV2Id || transformationType.workflowV2Id)
        : (pageGroupConfig?.workflowId || transformationType.workflowId);

      if (activeWorkflowId) {
        const fileName = `workflow-pdfs/${Date.now()}-${pageFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('pdfs').upload(fileName, pageFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Failed to upload PDF to storage: ${uploadError.message}`);
        }

        const extractedDataFileName = `extracted-data/${Date.now()}-extracted-data.json`;
        const extractedDataToUpload = resultToUse.extractedDataJson || JSON.stringify(resultToUse.extractedData) || '{}';

        try {
          JSON.parse(extractedDataToUpload);
        } catch (validateError) {
          throw new Error('Cannot upload invalid JSON to storage');
        }

        const { data: extractedDataUpload, error: extractedDataError } = await supabase.storage
          .from('pdfs')
          .upload(extractedDataFileName, new Blob([extractedDataToUpload], { type: 'application/json' }), { upsert: true });

        if (extractedDataError) {
          throw new Error(`Failed to upload extracted data to storage: ${extractedDataError.message}`);
        }

        const workflowRequestBody = {
          extractedData: null,
          extractedDataStoragePath: extractedDataUpload.path,
          workflowId: activeWorkflowId,
          userId: user?.id,
          transformationTypeId: transformationType.id,
          pdfFilename: resultToUse.newFilename,
          extractionTypeFilename: transformationType.filenameTemplate,
          pageGroupFilenameTemplate: pageGroupConfig?.filenameTemplate,
          pdfPages: 1,
          pdfStoragePath: uploadData.path,
          originalPdfFilename: pageFile.name,
          pdfBase64: pdfBase64,
          formatType: 'JSON'
        };

        try {
          const requestBodyString = JSON.stringify(workflowRequestBody);
          JSON.parse(requestBodyString);
        } catch (validateError) {
          throw new Error('Cannot send invalid JSON to workflow processor');
        }

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

        if (workflowResult.actualFilename) {
          setTransformResult(prev => prev ? { ...prev, newFilename: workflowResult.actualFilename } : prev);
        }

        const newWorkflowLogId = workflowResult.workflowExecutionLogId;
        setWorkflowExecutionLogId(newWorkflowLogId);

        if (activeWorkflowVersion === 'v2') {
          const v2LogTable = 'workflow_v2_execution_logs';
          startPollingWorkflowLog(newWorkflowLogId, v2LogTable);
        } else {
          startPollingWorkflowLog(newWorkflowLogId);
        }
        
        try {
          await supabase.storage.from('pdfs').remove([uploadData.path]);
          await supabase.storage.from('pdfs').remove([extractedDataUpload.path]);
        } catch (cleanupError) {
          console.warn('Failed to clean up uploaded files from storage:', cleanupError);
        }
        
        const finalFilenameFromWorkflow = workflowResult.actualFilename || resultToUse.newFilename;
        setTransformResult(prev => prev ? { ...prev, success: true, newFilename: finalFilenameFromWorkflow } : prev);
        onProcessComplete(pageIndex, { success: true, newFilename: finalFilenameFromWorkflow });

      } else {
        console.log('=== DIRECT SFTP PATH ===');
        console.log('No workflow, uploading directly to SFTP');
        console.log('🔧 Transformation type for SFTP config:', transformationType);
        console.log('🔧 Transformation type pagesPerGroup:', transformationType.pagesPerGroup);
        console.log('🔧 Transformation type documentStartDetectionEnabled:', transformationType.documentStartDetectionEnabled);
        
        const pdfBase64 = await fileToBase64(pageFile);
        
        console.log('📊 Direct SFTP upload - transformation type config:');
        console.log('📊   pagesPerGroup:', transformationType.pagesPerGroup);
        console.log('📊   documentStartDetectionEnabled:', transformationType.documentStartDetectionEnabled);
        console.log('📊   Using pdfUploadStrategy: all_pages_in_group (direct uploads)');
        
        const response = await fetch(`${supabaseUrl}/functions/v1/sftp-upload`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            sftpConfig,
            xmlContent: JSON.stringify(resultToUse.extractedData),
            pdfBase64,
            baseFilename: resultToUse.newFilename.replace('.pdf', ''),
            originalFilename: pageFile.name,
            userId: user?.id,
            transformationTypeId: transformationType.id,
            formatType: 'JSON',
            exactFilename: resultToUse.newFilename,
            pdfUploadStrategy: 'all_pages_in_group',
            specificPageToUpload: undefined
          })
        });
        
        console.log('📝 Direct SFTP filename calculated:', resultToUse.newFilename);
        
        // Determine PDF upload strategy from transformation type
        const pdfUploadStrategy = 'all_pages_in_group'; // Default for direct uploads
        const specificPageToUpload = undefined; // Not applicable for direct uploads
        
        console.log('📊 SFTP upload strategy for direct upload:', {
          pdfUploadStrategy,
          specificPageToUpload,
          note: 'Direct uploads always use all_pages_in_group strategy'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || errorData.error || 'Upload failed');
        }
        setTransformResult(prev => prev ? { ...prev, success: true } : prev);
        onProcessComplete(pageIndex, { success: true, newFilename: resultToUse.newFilename });
      }
      
    } catch (error) {
      setTransformResult(prev => prev ? {
        ...prev,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } : null);
      onProcessComplete(pageIndex, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleCopyExtractedData = async () => {
    if (!transformResult?.extractedData) return;
    
    try {
      await navigator.clipboard.writeText(transformResult.extractedDataJson || JSON.stringify(transformResult.extractedData, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleShowStatus = () => {
    if (transformResult?.success) {
      const finalFilename = workflowExecutionLog?.contextData?.actualFilename ||
        workflowExecutionLog?.contextData?.renamedFilename ||
        workflowExecutionLog?.contextData?.exactFilename ||
        transformResult.newFilename;
      setModalTitle(`Page ${pageIndex + 1} - Success`);
      setModalContent(
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <h4 className="text-lg font-semibold text-green-800 dark:text-green-300">Transformation Successful!</h4>
              <p className="text-green-700 dark:text-green-400">
                PDF renamed to: <span className="font-mono">{finalFilename}</span>
              </p>
              <p className="text-green-600 dark:text-green-300 text-sm mt-1">
                Using: {transformationType.name}
              </p>
            </div>
          </div>
        </div>
      );
    } else if (transformResult?.error) {
      setModalTitle(`Page ${pageIndex + 1} - Error`);
      setModalContent(
        <div className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            <div>
              <h4 className="text-lg font-semibold text-red-800 dark:text-red-300">Transformation Failed</h4>
              <p className="text-red-700 dark:text-red-400">An error occurred during transformation</p>
              <p className="text-red-600 dark:text-red-300 text-sm mt-1">
                Using: {transformationType.name}
              </p>
            </div>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <h5 className="font-medium text-red-800 dark:text-red-300 mb-2">Error Details:</h5>
            <p className="text-red-700 dark:text-red-400 text-sm">{transformResult.error}</p>
          </div>
        </div>
      );
    }
    setShowModal(true);
  };

  const handleShowExtractedData = () => {
    setModalTitle(`Page ${pageIndex + 1} - Extracted Data`);
    
    let displayData = transformResult?.extractedDataJson || JSON.stringify(transformResult?.extractedData, null, 2);
    
    setModalContent(
      <div className="space-y-4">
        <div className="flex items-center space-x-3 mb-4">
          <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          <div>
            <h4 className="text-lg font-semibold text-purple-800 dark:text-purple-300">Extracted Data</h4>
            <p className="text-purple-600 dark:text-purple-300 text-sm">Using: {transformationType.name}</p>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto leading-relaxed">
            {displayData}
          </pre>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => navigator.clipboard.writeText(displayData)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Copy className="h-4 w-4" />
            <span>Copy Data</span>
          </button>
        </div>
      </div>
    );
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalTitle('');
    setModalContent(null);
  };

  const currentWorkflowSteps = workflowSteps
    .filter(step => step.workflowId === transformationType.workflowId)
    .sort((a, b) => a.stepOrder - b.stepOrder);

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

  const getStepStatus = (step: WorkflowStep): 'pending' | 'running' | 'completed' | 'failed' => {
    if (!workflowExecutionLog) return 'pending';
    
    if (workflowExecutionLog.status === 'completed') {
      return 'completed';
    }
    
    if (workflowExecutionLog.status === 'failed') {
      if (step.id === workflowExecutionLog.currentStepId) {
        return 'failed';
      }
      const currentStepOrder = workflowSteps.find(s => s.id === workflowExecutionLog.currentStepId && s.workflowId === transformationType.workflowId)?.stepOrder || 0;
      return step.stepOrder < currentStepOrder ? 'completed' : 'pending';
    }
    
    if (workflowExecutionLog.status === 'running') {
      if (step.id === workflowExecutionLog.currentStepId) {
        return 'running';
      }
      const currentStepOrder = workflowSteps.find(s => s.id === workflowExecutionLog.currentStepId && s.workflowId === transformationType.workflowId)?.stepOrder || 0;
      return step.stepOrder < currentStepOrder ? 'completed' : 'pending';
    }
    
    return 'pending';
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm hover:bg-gray-50 dark:hover:bg-purple-900/20 transition-colors duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">{getPageDisplayName(pageFile.name)}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {(pageFile.size / 1024).toFixed(1)} KB
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                Type: {transformationType.name}
              </p>
              {transformResult?.newFilename && (
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-1">
                  New Filename: {
                    workflowExecutionLog?.contextData?.actualFilename ||
                    workflowExecutionLog?.contextData?.renamedFilename ||
                    workflowExecutionLog?.contextData?.exactFilename ||
                    transformResult.newFilename
                  }
                </p>
              )}
              {workflowExecutionLog?.contextData?.userMessage && (
                <div className="mt-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">{workflowExecutionLog.contextData.userMessage}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {!hidePreview && (
              <button
                onClick={handlePreviewTransform}
                disabled={isTransforming || isTransformingAll}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
              >
                {isTransforming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span>Preview Data</span>
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={handleTransformAndUpload}
              disabled={isTransforming || isTransformingAll}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-medium rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
            >
              {isTransforming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Transform & Upload</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Result Action Buttons */}
        {(transformResult?.success || transformResult?.error || transformResult?.extractedData) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Results:</span>
              
              {/* Status Button */}
              {transformResult && (
                <button
                  onClick={handleShowStatus}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center space-x-2 ${
                    isTransforming
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : transformResult.success
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                >
                  {isTransforming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : transformResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>Status</span>
                </button>
              )}
              
              {/* Extracted Data Button */}
              {transformResult?.extractedData && Object.keys(transformResult.extractedData).length > 0 && (
                <button
                  onClick={handleShowExtractedData}
                  className="px-3 py-2 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg font-medium text-sm transition-all duration-200 flex items-center space-x-2"
                >
                  <Eye className="h-4 w-4" />
                  <span>Extracted Data</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Workflow Steps Display */}
        {transformationType.workflowId && currentWorkflowSteps.length > 0 && (
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Workflow Progress:</span>
              <span className="text-xs text-gray-500">
                {currentWorkflowSteps.length} step{currentWorkflowSteps.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center space-x-2 flex-wrap">
              {currentWorkflowSteps.map((step, index) => {
                const status = getStepStatus(step);
                const isLastStep = index === currentWorkflowSteps.length - 1;
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${getStepStatusColor(status)}`}
                      title={`Step ${step.stepOrder}: ${step.stepName} (${status})`}
                    >
                      {step.stepOrder}
                    </div>
                    {!isLastStep && (
                      <div className={`w-6 h-0.5 mx-1 transition-colors duration-200 ${
                        status === 'completed' ? 'bg-green-300' : 'bg-gray-300'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Workflow Status Text */}
            {workflowExecutionLog && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Status: <span className="font-medium">{workflowExecutionLog.status}</span>
                  {workflowExecutionLog.currentStepName && (
                    <span> • Current: {workflowExecutionLog.currentStepName}</span>
                  )}
                </p>
                {workflowExecutionLog.errorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Error: {workflowExecutionLog.errorMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={modalTitle}
      >
        {modalContent}
      </Modal>
    </>
  );
}