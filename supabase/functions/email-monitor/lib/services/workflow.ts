import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ExtractionType, SftpConfig, ApiConfig, WorkflowResult } from '../../types.ts';
import { getSupabaseUrl, getSupabaseServiceKey } from '../../config.ts';
import { injectParseitId } from '../utils.ts';

export async function executeWorkflowForEmail(
  workflowId: string,
  extractedData: string,
  extractionType: ExtractionType,
  attachment: { filename: string; base64: string },
  pageCount: number,
  supabase: SupabaseClient,
  senderEmail: string,
  extractionLogId: string | null = null,
  workflowOnlyDataStr: string = '{}',
  workflowVersion: 'v1' | 'v2' = 'v1'
): Promise<WorkflowResult> {
  console.log('Executing workflow for email attachment:', {
    workflowId,
    workflowVersion,
    extractionType: extractionType.name,
    filename: attachment.filename,
    senderEmail,
    extractionLogId,
    hasWFOData: workflowOnlyDataStr !== '{}'
  });

  const formatType = extractionType.format_type || 'JSON';
  const processorEndpoint = workflowVersion === 'v2'
    ? 'json-workflow-processor-v2'
    : (formatType === 'CSV' ? 'csv-workflow-processor' : 'json-workflow-processor');

  let parsedWfoData = {};
  try {
    parsedWfoData = typeof workflowOnlyDataStr === 'string' ? JSON.parse(workflowOnlyDataStr) : workflowOnlyDataStr;
  } catch (e) {
    console.warn('Failed to parse workflowOnlyData, using empty object:', e);
    parsedWfoData = {};
  }

  const workflowRequest = {
    extractedData: typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData,
    workflowOnlyData: parsedWfoData,
    workflowId,
    userId: null,
    extractionTypeId: extractionType.id,
    extractionLogId,
    pdfFilename: attachment.filename,
    pdfPages: pageCount,
    pdfBase64: attachment.base64,
    originalPdfFilename: attachment.filename,
    formatType,
    extractionTypeFilename: extractionType.filename,
    senderEmail: senderEmail || null,
    triggerSource: 'email_monitoring'
  };

  console.log('Calling workflow processor:', processorEndpoint);

  const response = await fetch(
    `${getSupabaseUrl()}/functions/v1/${processorEndpoint}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSupabaseServiceKey()}`
      },
      body: JSON.stringify(workflowRequest)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Workflow execution failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Workflow execution completed:', {
    success: result.success,
    workflowExecutionLogId: result.workflowExecutionLogId
  });

  return result;
}

export async function uploadToSftp(
  sftpConfig: SftpConfig,
  base64Data: string,
  originalFilename: string,
  extractionTypeFilename: string,
  extractionTypeId: string,
  xmlData: string | null,
  parseitId: number | null,
  supabase: SupabaseClient
): Promise<any> {
  try {
    const response = await fetch(`${getSupabaseUrl()}/functions/v1/sftp-upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getSupabaseServiceKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sftpConfig,
        base64Data,
        originalFilename,
        extractionTypeFilename,
        extractionTypeId,
        xmlData,
        parseitId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SFTP upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('SFTP upload successful:', result);
    return result;
  } catch (error) {
    console.error('SFTP upload error:', error);
    throw error;
  }
}

export async function sendToDirectApi(
  extractedContent: string,
  extractionType: ExtractionType,
  apiConfig: ApiConfig,
  supabase: SupabaseClient
): Promise<{ response: any; statusCode: number; finalData: string }> {
  const { data: newParseitId, error: parseitIdError } = await supabase.rpc('get_next_parseit_id');
  if (parseitIdError) throw new Error(`Failed to get ParseIt ID: ${parseitIdError.message}`);

  let finalDataToSend = extractedContent;

  if (extractionType.parseit_id_mapping && newParseitId) {
    finalDataToSend = JSON.stringify(
      injectParseitId(JSON.parse(extractedContent), extractionType.parseit_id_mapping, newParseitId),
      null,
      2
    );
  }

  if (!apiConfig || !apiConfig.path || !extractionType.json_path) {
    throw new Error('API configuration incomplete for JSON extraction');
  }

  const apiUrl = apiConfig.path.endsWith('/')
    ? `${apiConfig.path.slice(0, -1)}${extractionType.json_path}`
    : `${apiConfig.path}${extractionType.json_path}`;

  console.log('Sending to API URL:', apiUrl);
  console.log('Final JSON being sent (first 1000 chars):', finalDataToSend.substring(0, 1000));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (apiConfig.password) {
    headers['Authorization'] = `Bearer ${apiConfig.password}`;
  }

  const apiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: finalDataToSend
  });

  if (!apiResponse.ok) {
    const errorDetails = await apiResponse.text();
    throw new Error(`API call failed: ${apiResponse.status} ${apiResponse.statusText} - ${errorDetails}`);
  }

  const apiResponseData = await apiResponse.json();
  console.log('API call successful:', apiResponseData);

  return {
    response: apiResponseData,
    statusCode: apiResponse.status,
    finalData: finalDataToSend
  };
}

export async function getParseitId(supabase: SupabaseClient): Promise<number> {
  const { data: newParseitId, error: parseitIdError } = await supabase.rpc('get_next_parseit_id');
  if (parseitIdError) throw new Error(`Failed to get ParseIt ID: ${parseitIdError.message}`);
  return newParseitId;
}
