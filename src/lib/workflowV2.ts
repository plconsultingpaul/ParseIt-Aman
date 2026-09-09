import { getAuthHeaders } from './supabase';

interface WorkflowV2ExecutionRequest {
  extractedData: string | null;
  extractedDataStoragePath?: string;
  workflowOnlyData?: string;
  workflowId: string;
  userId?: string;
  extractionTypeId?: string;
  transformationTypeId?: string;
  pdfFilename: string;
  pdfPages: number;
  pdfBase64: string;
  pdfStoragePath?: string;
  originalPdfFilename: string;
  formatType?: string;
  extractionTypeFilename?: string;
  pageGroupFilenameTemplate?: string;
  sessionId?: string;
  groupOrder?: number | null;
  submitterEmail?: string;
}

export async function executeWorkflowV2(request: WorkflowV2ExecutionRequest): Promise<any> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase configuration missing');
  }

  const fullUrl = `${supabaseUrl}/functions/v1/json-workflow-processor-v2`;
  const headers = await getAuthHeaders();

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      const errorText = await response.text();
      throw new Error(`V2 workflow execution failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const apiError: any = new Error(errorData.details || errorData.error || 'V2 workflow execution failed');
    apiError.workflowExecutionLogId = errorData.workflowExecutionLogId;
    apiError.extractionLogId = errorData.extractionLogId;
    throw apiError;
  }

  return await response.json();
}

export async function executeTransformWorkflowV2(request: WorkflowV2ExecutionRequest): Promise<any> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase configuration missing');
  }

  const fullUrl = `${supabaseUrl}/functions/v1/transform-workflow-processor-v2`;
  const headers = await getAuthHeaders();

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      const errorText = await response.text();
      throw new Error(`V2 transform workflow failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const apiError: any = new Error(errorData.details || errorData.error || 'V2 transform workflow failed');
    apiError.workflowExecutionLogId = errorData.workflowExecutionLogId;
    apiError.extractionLogId = errorData.extractionLogId;
    throw apiError;
  }

  return await response.json();
}
