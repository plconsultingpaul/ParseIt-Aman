import React, { useState, useEffect } from 'react';
import { FileText, Send, Loader2, Copy, CheckCircle, XCircle, Eye, Database, AlertCircle, Trash2, FileImage, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PageProcessingState, ApiError, WorkflowStep, ExtractionType, WorkflowExecutionLog } from '../../types';
import { fetchWorkflowStepLogsByExecutionId, type WorkflowStepLog } from '../../services/logService';
import Modal from '../common/Modal';
import CsvPreviewModal from './CsvPreviewModal';

interface PageProcessorCardProps {
  pageFile: File;
  pageIndex: number;
  pageState: PageProcessingState;
  isExtractingAll: boolean;
  isJsonType: boolean;
  workflowSteps: WorkflowStep[];
  currentExtractionType: ExtractionType;
  onPreview: (pageIndex: number) => void;
  onProcess: (pageIndex: number) => void;
  onRemove: (pageIndex: number) => void;
}

export default function PageProcessorCard({
  pageFile,
  pageIndex,
  pageState,
  isExtractingAll,
  isJsonType,
  workflowSteps,
  currentExtractionType,
  onPreview,
  onProcess,
  onRemove
}: PageProcessorCardProps) {
  const isCsvType = currentExtractionType?.formatType === 'CSV';
  const dataLabel = isCsvType ? 'CSV' : (isJsonType ? 'JSON' : 'XML');

  // State to store fetched workflow step logs
  const [workflowStepLogs, setWorkflowStepLogs] = useState<WorkflowStepLog[]>([]);
  const [isLoadingStepLogs, setIsLoadingStepLogs] = useState(false);

  // Fetch workflow step logs when workflowExecutionLog becomes available
  useEffect(() => {
    const loadStepLogs = async () => {
      if (pageState.workflowExecutionLog?.id && !isLoadingStepLogs) {
        setIsLoadingStepLogs(true);
        try {
          const logs = await fetchWorkflowStepLogsByExecutionId(pageState.workflowExecutionLog.id);
          setWorkflowStepLogs(logs);
        } catch (error) {
          console.error('Failed to load workflow step logs:', error);
        } finally {
          setIsLoadingStepLogs(false);
        }
      }
    };

    loadStepLogs();
  }, [pageState.workflowExecutionLog?.id]);

  // Extract billNumber from API response for quick display
  const getBillNumber = (): string | null => {
    console.log('getBillNumber called for page', pageIndex + 1);
    console.log('pageState:', pageState);
    
    // First, try to get bill number from the actual API response (this contains the bill number returned by the server)
    if (pageState.apiResponse) {
      console.log('Checking API response for bill number...');
      try {
        const apiData = JSON.parse(pageState.apiResponse);
        console.log('Parsed API response:', apiData);
        
        // Look for billNumber in various possible locations in API response
        if (apiData.billNumber) {
          console.log('Found billNumber in API root:', apiData.billNumber);
          return apiData.billNumber;
        }
        
        if (apiData.orders && Array.isArray(apiData.orders) && apiData.orders.length > 0) {
          const billNumber = apiData.orders[0].billNumber;
          console.log('Found billNumber in API orders[0]:', billNumber);
          if (billNumber) return billNumber;
        }
        
        // Check if API response has a data field with orders
        if (apiData.data && apiData.data.orders && Array.isArray(apiData.data.orders) && apiData.data.orders.length > 0) {
          const billNumber = apiData.data.orders[0].billNumber;
          console.log('Found billNumber in API data.orders[0]:', billNumber);
          if (billNumber) return billNumber;
        }
        
        // Check for other common API response patterns
        if (apiData.result && apiData.result.billNumber) {
          console.log('Found billNumber in API result:', apiData.result.billNumber);
          return apiData.result.billNumber;
        }
        
        // Check if the response is just a bill number string
        if (typeof apiData === 'string' && apiData.match(/^[A-Z0-9]+$/)) {
          console.log('API response appears to be a bill number string:', apiData);
          return apiData;
        }
        
      } catch (error) {
        console.error('Error parsing API response for bill number:', error);
      }
    }
    
    // For workflow executions, check if we have workflow execution log with context data
    if (pageState.workflowExecutionLog?.contextData) {
      console.log('Checking workflow execution log context data...');
      console.log('contextData:', pageState.workflowExecutionLog.contextData);
      
      try {
        const workflowData = pageState.workflowExecutionLog.contextData;
        
        // First try to get from extractedData in context
        if (workflowData.extractedData) {
          console.log('Found extractedData in workflow context:', workflowData.extractedData);
          if (workflowData.extractedData.orders && Array.isArray(workflowData.extractedData.orders) && workflowData.extractedData.orders.length > 0) {
            const billNumber = workflowData.extractedData.orders[0].billNumber;
            console.log('Found billNumber in extractedData.orders[0]:', billNumber);
            if (billNumber) return billNumber;
          }
          if (workflowData.extractedData.billNumber) {
            console.log('Found billNumber in extractedData root:', workflowData.extractedData.billNumber);
            return workflowData.extractedData.billNumber;
          }
        }
        
        // Then try to get from the root context data (final result)
        // Look for billNumber in the workflow context data
        if (workflowData.orders && Array.isArray(workflowData.orders) && workflowData.orders.length > 0) {
          const billNumber = workflowData.orders[0].billNumber;
          console.log('Found billNumber in context orders[0]:', billNumber);
          if (billNumber) return billNumber;
        }
        
        // Fallback: look for billNumber at root level of context
        if (workflowData.billNumber) {
          console.log('Found billNumber at context root:', workflowData.billNumber);
          return workflowData.billNumber;
        }
        
        console.log('No billNumber found in workflow context data');
      } catch (error) {
        console.error('Error extracting bill number from workflow context:', error);
      }
    }
    
    // Try to get bill number from extracted data directly
    if (pageState.extractedData) {
      console.log('Checking extracted data for bill number...');
      // Only try to parse as JSON if this is a JSON type extraction
      if (isJsonType) {
        try {
          const extractedJson = JSON.parse(pageState.extractedData);
          console.log('Parsed extracted data:', extractedJson);
          
          if (extractedJson.orders && Array.isArray(extractedJson.orders) && extractedJson.orders.length > 0) {
            const billNumber = extractedJson.orders[0].billNumber;
            console.log('Found billNumber in extracted orders[0]:', billNumber);
            if (billNumber) return billNumber;
          }
          
          if (extractedJson.billNumber) {
            console.log('Found billNumber in extracted root:', extractedJson.billNumber);
            return extractedJson.billNumber;
          }
        } catch (error) {
          console.error('Error parsing extracted data for bill number:', error);
        }
      } else {
        console.log('Skipping JSON parsing for XML extraction type');
      }
    }
    
    console.log('No bill number found anywhere');
    return null;
  };

  const billNumber = getBillNumber();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [isLoadingPdfPreview, setIsLoadingPdfPreview] = useState(false);
  const [pdfZoomLevel, setPdfZoomLevel] = useState(1.5);
  const [cachedPdfPage, setCachedPdfPage] = useState<any>(null);
  const [pdfPreviewImage, setPdfPreviewImage] = useState<string>('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [pendingCsvPreview, setPendingCsvPreview] = useState(false);

  // Auto-show CSV preview after extraction completes (for preview action)
  useEffect(() => {
    if (pendingCsvPreview && pageState.extractedData && !pageState.isExtracting) {
      setShowCsvPreview(true);
      setPendingCsvPreview(false);
    }
  }, [pendingCsvPreview, pageState.extractedData, pageState.isExtracting]);

  const handlePreviewData = async () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`[PageProcessorCard] 🚀 PREVIEW BUTTON CLICKED - Page ${pageIndex + 1}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log(`[PageProcessorCard] File: ${pageFile.name}, Size: ${pageFile.size} bytes`);
    console.log(`[PageProcessorCard] Format type: ${currentExtractionType?.formatType}`);
    console.log(`[PageProcessorCard] Has extracted data: ${!!pageState.extractedData}`);
    console.log(`[PageProcessorCard] Extracted data type: ${typeof pageState.extractedData}`);
    console.log(`[PageProcessorCard] Extracted data length: ${pageState.extractedData?.length || 0}`);
    console.log(`[PageProcessorCard] Extracted data preview (first 300 chars): ${pageState.extractedData?.substring(0, 300)}`);

    if (isCsvType) {
      if (!pageState.extractedData) {
        console.log(`[PageProcessorCard] No existing data - initiating extraction for page ${pageIndex + 1}`);
        setPendingCsvPreview(true);
        onPreview(pageIndex);
      } else {
        console.log(`[PageProcessorCard] Using cached data - opening CSV preview for page ${pageIndex + 1}`);
        console.log(`[PageProcessorCard] About to pass to CsvPreviewModal:`, {
          csvContentType: typeof pageState.extractedData,
          csvContentLength: pageState.extractedData.length,
          csvContentIsString: typeof pageState.extractedData === 'string',
          csvContentPreview: pageState.extractedData.substring(0, 100)
        });
        setShowCsvPreview(true);
      }
    } else {
      console.log(`[PageProcessorCard] Non-CSV type - calling onPreview for page ${pageIndex + 1}`);
      onPreview(pageIndex);
    }
  };

  const handleExtractAndSend = () => onProcess(pageIndex);

  const handleShowStatus = () => {
    if (pageState.success) {
      setModalTitle(`Page ${pageIndex + 1} - Success`);
      setModalContent(
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <h4 className="text-lg font-semibold text-green-800 dark:text-green-300">Processing Successful!</h4>
              <p className="text-green-700 dark:text-green-400">
                Data extracted and {isJsonType ? 'sent to API' : 'uploaded via SFTP'} successfully!
              </p>
            </div>
          </div>
        </div>
      );
    } else if (pageState.extractionError || pageState.apiError) {
      setModalTitle(`Page ${pageIndex + 1} - Error`);
      setModalContent(
        <div className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            <div>
              <h4 className="text-lg font-semibold text-red-800 dark:text-red-300">Processing Failed</h4>
              <p className="text-red-700 dark:text-red-400">An error occurred during processing</p>
            </div>
          </div>
          
          {pageState.extractionError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <h5 className="font-medium text-red-800 dark:text-red-300 mb-2">Extraction Error:</h5>
              <p className="text-red-700 dark:text-red-400 text-sm">{pageState.extractionError}</p>
            </div>
          )}
          
          {pageState.apiError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <h5 className="font-medium text-red-800 dark:text-red-300 mb-3">API Error Details:</h5>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-red-800 dark:text-red-300">Status:</span>
                    <p className="text-red-700 dark:text-red-400">
                      {pageState.apiError.statusCode > 0 
                        ? `${pageState.apiError.statusCode} ${pageState.apiError.statusText}`
                        : pageState.apiError.statusText
                      }
                    </p>
                  </div>
                  {pageState.apiError.url && (
                    <div>
                      <span className="font-medium text-red-800 dark:text-red-300">URL:</span>
                      <p className="text-red-700 dark:text-red-400 break-all">{pageState.apiError.url}</p>
                    </div>
                  )}
                </div>
                
                {pageState.apiError.details && (
                  <div>
                    <span className="font-medium text-red-800 dark:text-red-300 block mb-2">Response Details:</span>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-300 dark:border-red-600 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-red-800 dark:text-red-300 whitespace-pre-wrap font-mono">
                        {typeof pageState.apiError.details === 'string' 
                          ? pageState.apiError.details 
                          : JSON.stringify(pageState.apiError.details, null, 2)
                        }
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }
    setShowModal(true);
  };

  const handleShowApiResponse = () => {
    setModalTitle(`Page ${pageIndex + 1} - API Response`);
    setModalContent(
      <div className="space-y-4">
        <div className="flex items-center space-x-3 mb-4">
          <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h4 className="text-lg font-semibold text-blue-800 dark:text-blue-300">API Response Data</h4>
        </div>
        <div className="bg-blue-50 dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-gray-600">
          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
            {pageState.apiResponse}
          </pre>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => navigator.clipboard.writeText(pageState.apiResponse)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Copy className="h-4 w-4" />
            <span>Copy Response</span>
          </button>
        </div>
      </div>
    );
    setShowModal(true);
  };

  const handleShowExtractedData = () => {
    console.log('[PageProcessorCard] ========================================');
    console.log('[PageProcessorCard] Show Extracted Data / Preview Mappings clicked');
    console.log('[PageProcessorCard] Page index:', pageIndex);
    console.log('[PageProcessorCard] Format type:', currentExtractionType?.formatType);
    console.log('[PageProcessorCard] Extraction type name:', currentExtractionType?.name);
    console.log('[PageProcessorCard] Field mappings count:', currentExtractionType?.fieldMappings?.length || 0);
    console.log('[PageProcessorCard] Field mappings:', JSON.stringify(currentExtractionType?.fieldMappings, null, 2));
    console.log('[PageProcessorCard] Raw extractedData (first 2000 chars):', typeof pageState.extractedData === 'string' ? pageState.extractedData.substring(0, 2000) : pageState.extractedData);
    console.log('[PageProcessorCard] Raw workflowOnlyData:', pageState.workflowOnlyData);
    try {
      if (pageState.workflowOnlyData) {
        const parsedWfo = JSON.parse(pageState.workflowOnlyData);
        console.log('[PageProcessorCard] Parsed WFO keys (flat):', Object.keys(parsedWfo));
        console.log('[PageProcessorCard] Parsed WFO object:', parsedWfo);
        console.log('[PageProcessorCard] NOTE: If a WFO key contains a "." (e.g. "stop1.Shipment") it is a FLAT key, not nested. The IF/THEN function evaluator walks nested paths, which is why it cannot see these fields.');
      }
      if (pageState.extractedData && typeof pageState.extractedData === 'string') {
        const parsedOut = JSON.parse(pageState.extractedData);
        console.log('[PageProcessorCard] Parsed output top-level keys:', Object.keys(parsedOut));
      }
    } catch (e) {
      console.warn('[PageProcessorCard] Failed to parse preview data for logging:', e);
    }

    setModalTitle(`Page ${pageIndex + 1} - Extracted Mappings`);

    // Format JSON data for better display
    let outputData = pageState.extractedData;
    let workflowData = pageState.workflowOnlyData || '{}';

    if (isJsonType) {
      try {
        const parsedJson = JSON.parse(pageState.extractedData);
        outputData = JSON.stringify(parsedJson, null, 2);

        if (pageState.workflowOnlyData && pageState.workflowOnlyData !== '{}') {
          const parsedWorkflow = JSON.parse(pageState.workflowOnlyData);
          workflowData = JSON.stringify(parsedWorkflow, null, 2);
        }
      } catch (error) {
        outputData = pageState.extractedData;
      }
    }

    setModalContent(
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Regular Output Data */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-100 dark:border-blue-900">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Output Data</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Fields sent to API/SFTP</p>
            </div>
            <div className="p-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
                  {outputData}
                </pre>
              </div>
            </div>
          </div>

          {/* Workflow Only Data */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-green-100 dark:border-green-900">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Workflow Only Data</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Fields for workflow processing</p>
            </div>
            <div className="p-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-96 overflow-y-auto">
                {workflowData === '{}' ? (
                  <p className="text-gray-500 dark:text-gray-400 italic">No workflow-only fields configured</p>
                ) : (
                  <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
                    {workflowData}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={() => navigator.clipboard.writeText(outputData)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Copy className="h-4 w-4" />
            <span>Copy Output Data</span>
          </button>
          {workflowData !== '{}' && (
            <button
              onClick={() => navigator.clipboard.writeText(workflowData)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>Copy Workflow Data</span>
            </button>
          )}
        </div>
      </div>
    );
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalTitle('');
    setModalContent(null);
    setCachedPdfPage(null);
    setPdfZoomLevel(1.5);
    setPdfPreviewImage('');
    setShowPdfPreview(false);
    setShowCsvPreview(false);
    setPendingCsvPreview(false);
  };

  const handleZoomChange = async (newZoom: number) => {
    if (!cachedPdfPage) return;

    const minZoom = 0.5;
    const maxZoom = 4.0;
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

    setPdfZoomLevel(clampedZoom);
    setIsLoadingPdfPreview(true);

    try {
      const imageDataUrl = await renderPdfAtScale(cachedPdfPage, clampedZoom);
      setPdfPreviewImage(imageDataUrl);
    } catch (error) {
      console.error('Error re-rendering PDF at new zoom:', error);
    } finally {
      setIsLoadingPdfPreview(false);
    }
  };

  const renderPdfPreviewContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <FileImage className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          <h4 className="text-lg font-semibold text-purple-800 dark:text-purple-300">PDF Page Preview</h4>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleZoomChange(pdfZoomLevel - 0.25)}
            disabled={pdfZoomLevel <= 0.5 || isLoadingPdfPreview}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px] text-center">
            {Math.round(pdfZoomLevel * 100)}%
          </span>
          <button
            onClick={() => handleZoomChange(pdfZoomLevel + 0.25)}
            disabled={pdfZoomLevel >= 4.0 || isLoadingPdfPreview}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleZoomChange(1.5)}
            disabled={isLoadingPdfPreview}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
            title="Reset zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-600 overflow-auto" style={{ maxHeight: '75vh' }}>
        <div className="flex justify-center">
          {isLoadingPdfPreview ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          ) : (
            <img
              src={pdfPreviewImage}
              alt={`PDF Page ${pageIndex + 1}`}
              className="rounded shadow-lg"
              style={{ width: 'auto', height: 'auto' }}
            />
          )}
        </div>
      </div>
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          File: {pageFile.name} • Size: {(pageFile.size / 1024).toFixed(1)} KB
        </p>
        <a
          href={pdfPreviewImage}
          download={`page_${pageIndex + 1}_preview.png`}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Copy className="h-4 w-4" />
          <span>Download Image</span>
        </a>
      </div>
    </div>
  );

  const renderPdfAtScale = async (page: any, scale: number) => {
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return canvas.toDataURL('image/png');
  };

  const handleShowPdfPreview = async () => {
    setIsLoadingPdfPreview(true);

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const arrayBuffer = await pageFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      setCachedPdfPage(page);
      setPdfZoomLevel(1.5);

      const imageDataUrl = await renderPdfAtScale(page, 1.5);
      setPdfPreviewImage(imageDataUrl);

      setModalTitle(`Page ${pageIndex + 1} - PDF Preview`);
      setShowPdfPreview(true);
      setShowModal(true);

    } catch (error) {
      console.error('Error rendering PDF preview:', error);
      setModalTitle(`Page ${pageIndex + 1} - Preview Error`);
      setModalContent(
        <div className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            <div>
              <h4 className="text-lg font-semibold text-red-800 dark:text-red-300">Preview Failed</h4>
              <p className="text-red-700 dark:text-red-400">Could not render PDF preview</p>
            </div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-400 text-sm">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
          </div>
        </div>
      );
      setShowModal(true);
    } finally {
      setIsLoadingPdfPreview(false);
    }
  };

  // Get workflow steps for the current extraction type
  const currentWorkflowSteps = workflowSteps
    .filter(step => step.workflowId === currentExtractionType.workflowId)
    .sort((a, b) => a.stepOrder - b.stepOrder);

  const getStepStatus = (step: WorkflowStep) => {
    if (!pageState.workflowExecutionLog) return 'pending';

    const stepLog = workflowStepLogs.find(log => log.stepId === step.id);
    if (stepLog) {
      if (stepLog.status === 'completed') return 'completed';
      if (stepLog.status === 'failed') return 'failed';
      if (stepLog.status === 'running') return 'running';
      if (stepLog.status === 'skipped') return 'skipped';
    }

    if (workflowStepLogs.length > 0) {
      return 'skipped';
    }

    const currentStepId = pageState.workflowExecutionLog.currentStepId;
    const isCurrentStep = step.id === currentStepId;
    const status = pageState.workflowExecutionLog.status;

    if (status === 'completed') {
      return 'completed';
    }

    if (isCurrentStep) {
      if (status === 'failed') {
        return 'failed';
      }
      if (status === 'running') {
        return 'running';
      }
    }

    if (currentStepId) {
      const currentStep = workflowSteps.find(s => s.id === currentStepId);
      if (currentStep && currentStep.stepOrder > step.stepOrder) {
        return 'completed';
      }
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
      case 'skipped':
        return 'bg-gray-400 dark:bg-gray-600 text-gray-100';
      default:
        return 'bg-gray-300 text-gray-600';
    }
  };

  const getStepStatusIcon = (status: string, stepOrder: number) => {
    return stepOrder.toString();
  };

  // Determine status for the status button
  const hasStatus = pageState.success || pageState.extractionError || pageState.apiError;
  const isSuccess = pageState.success && !pageState.extractionError && !pageState.apiError;

  return (
    <>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm hover:bg-gray-50 dark:hover:bg-purple-900/20 transition-colors duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">PAGE {pageIndex + 1}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {(pageFile.size / 1024).toFixed(1)} KB
              </p>
              {billNumber && (
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-1">
                  Bill #: {billNumber}
                </p>
              )}
              {pageState.userMessage && (
                <div className="mt-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">{pageState.userMessage}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => onRemove(pageIndex)}
              disabled={pageState.isProcessing || pageState.isExtracting || isExtractingAll}
              className="ml-2 p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Remove this page"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleShowPdfPreview}
              disabled={isLoadingPdfPreview || isExtractingAll}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
              title="View PDF page"
            >
              {isLoadingPdfPreview ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <FileImage className="h-4 w-4" />
                  <span>View PDF</span>
                </>
              )}
            </button>

            <button
              onClick={handlePreviewData}
              disabled={pageState.isExtracting || isExtractingAll}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
            >
              {pageState.isExtracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  <span>Preview Mappings</span>
                </>
              )}
            </button>

            <button
              onClick={handleExtractAndSend}
              disabled={pageState.isProcessing || isExtractingAll}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-medium rounded-lg transition-all duration-200 flex items-center space-x-2 disabled:cursor-not-allowed"
            >
              {pageState.isProcessing ? (
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
        </div>

        {/* Result Action Buttons */}
        {(hasStatus || pageState.extractedData || (isJsonType && pageState.apiResponse)) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Results:</span>
              
              {/* Status Button */}
              {hasStatus && (
                <button
                  onClick={handleShowStatus}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center space-x-2 ${
                    isSuccess
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                >
                  {isSuccess ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>Status</span>
                </button>
              )}
              
              {/* Extracted Data Button */}
              {pageState.extractedData && (
                <button
                  onClick={handleShowExtractedData}
                  className="px-3 py-2 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg font-medium text-sm transition-all duration-200 flex items-center space-x-2"
                >
                  <Eye className="h-4 w-4" />
                  <span>Extracted {dataLabel}</span>
                </button>
              )}
              
              {/* API Response Button */}
              {isJsonType && (pageState.apiResponse || pageState.apiError) && (
                <button
                  onClick={handleShowApiResponse}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center space-x-2 ${
                    pageState.apiResponse && !pageState.apiError
                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                  }`}
                >
                  <Database className="h-4 w-4" />
                  <span>API Response</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Workflow Steps Display */}
        {currentExtractionType.workflowId && currentWorkflowSteps.length > 0 && (
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Workflow Progress:</span>
              <span className="text-xs text-gray-500">
                {currentWorkflowSteps.length} step{currentWorkflowSteps.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {currentWorkflowSteps.map((step) => {
                const status = getStepStatus(step);
                const stepLog = workflowStepLogs.find(log => log.stepId === step.id);
                const userResponse = stepLog?.userResponse;

                return (
                  <div key={step.id} className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 flex-shrink-0 ${getStepStatusColor(status)}`}
                      title={`Step ${step.stepOrder}: ${step.stepName} (${status})`}
                    >
                      {getStepStatusIcon(status, step.stepOrder)}
                    </div>
                    <span className={`text-sm truncate ${
                      status === 'completed' ? 'text-green-600 dark:text-green-400' :
                      status === 'failed' ? 'text-red-600 dark:text-red-400' :
                      status === 'skipped' ? 'text-gray-500 dark:text-gray-400' :
                      'text-gray-600 dark:text-gray-300'
                    }`} title={userResponse || step.stepName}>
                      {userResponse || step.stepName}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* Workflow Status Text */}
            {pageState.workflowExecutionLog && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Status: <span className="font-medium">{pageState.workflowExecutionLog.status}</span>
                  {pageState.workflowExecutionLog.currentStepName && (
                    <span> • Current: {pageState.workflowExecutionLog.currentStepName}</span>
                  )}
                </p>
                {pageState.workflowExecutionLog.errorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Error: {pageState.workflowExecutionLog.errorMessage}
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
        {showPdfPreview ? renderPdfPreviewContent() : modalContent}
      </Modal>

      {/* CSV Preview Modal */}
      {isCsvType && pageState.extractedData && (
        <CsvPreviewModal
          isOpen={showCsvPreview}
          onClose={() => setShowCsvPreview(false)}
          csvContent={pageState.extractedData}
          delimiter={currentExtractionType.csvDelimiter || ','}
          hasHeaders={currentExtractionType.csvIncludeHeaders !== false}
          pageTitle={`Page ${pageIndex + 1} - CSV Preview`}
        />
      )}
    </>
  );
}