import { supabase } from '../lib/supabase';
import { buildJsonPayload, buildAuthHeaders, submitWithRetry, parseApiResponse } from '../lib/jsonPayloadMapper';
import { executeWorkflow } from '../lib/workflow';
import { applyFieldMappingPostProcessing } from '../lib/fieldMappingProcessor';
import type { OrderEntryField, OrderEntryFieldGroup, FieldMapping, ExtractionType } from '../types';

interface SubmissionConfig {
  apiEndpoint: string;
  apiMethod: string;
  apiHeaders: Record<string, string>;
  apiAuthType: string | null;
  apiAuthToken: string | null;
  workflowId: string | null;
  isEnabled: boolean;
}

interface SubmissionResult {
  success: boolean;
  submissionId: string;
  apiResponse: any;
  apiStatusCode: number;
  workflowExecutionId?: string;
  error?: string;
}

export async function loadSubmissionConfig(): Promise<SubmissionConfig | null> {

  const { data, error } = await supabase
    .from('order_entry_config')
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[OrderEntry] Failed to load submission config:', error);
    return null;
  }

  if (!data) {
    console.warn('[OrderEntry] No submission config found in order_entry_config table');
    return null;
  }

  return {
    apiEndpoint: data.api_endpoint || '',
    apiMethod: data.api_method || 'POST',
    apiHeaders: data.api_headers || {},
    apiAuthType: data.api_auth_type || null,
    apiAuthToken: data.api_auth_token || null,
    workflowId: data.workflow_id || null,
    isEnabled: data.is_enabled || false
  };
}

export async function submitOrderEntry(
  formData: Record<string, any>,
  fields: OrderEntryField[],
  userId: string,
  pdfId: string | null,
  config: SubmissionConfig,
  extractionTypeId?: string | null,
  fieldGroups?: OrderEntryFieldGroup[]
): Promise<SubmissionResult> {

  if (extractionTypeId) {
    return submitViaExtractionType(formData, fields, userId, pdfId, extractionTypeId, fieldGroups || []);
  }

  try {
    const { data: fieldGroups, error: fieldGroupsError } = await supabase
      .from('order_entry_field_groups')
      .select('*');

    if (fieldGroupsError) {
      console.error('[OrderEntry] Failed to load field groups:', fieldGroupsError);
    }

    const payload = buildJsonPayload(formData, fields, fieldGroups || []);

    const headers = buildAuthHeaders(
      config.apiAuthType,
      config.apiAuthToken,
      config.apiHeaders
    );

    const response = await submitWithRetry(
      config.apiEndpoint,
      {
        method: config.apiMethod,
        headers,
        body: JSON.stringify(payload)
      }
    );

    const responseBody = await parseResponseBody(response);

    const parsedResponse = parseApiResponse(response, responseBody);

    const submissionId = await saveSubmission({
      userId,
      pdfId,
      submissionData: payload,
      rawFormData: formData,
      apiResponse: responseBody,
      apiStatusCode: response.status,
      status: parsedResponse.success ? 'completed' : 'failed',
      errorMessage: parsedResponse.success ? null : parsedResponse.message
    });

    if (parsedResponse.success && config.workflowId) {
      try {
        const workflowExecutionId = await triggerWorkflow(
          config.workflowId,
          submissionId,
          payload,
          responseBody,
          response.status,
          pdfId
        );

        await linkWorkflowToSubmission(submissionId, workflowExecutionId);

        return {
          success: true,
          submissionId,
          apiResponse: responseBody,
          apiStatusCode: response.status,
          workflowExecutionId
        };
      } catch (workflowError: any) {
        console.error('[OrderEntry] Workflow trigger failed:', workflowError);

        return {
          success: true,
          submissionId,
          apiResponse: responseBody,
          apiStatusCode: response.status,
          error: `Order submitted successfully, but workflow failed: ${workflowError.message}`
        };
      }
    } else if (parsedResponse.success) {
    } else {
      console.error('[OrderEntry] API call failed:', parsedResponse.message);
    }

    return {
      success: parsedResponse.success,
      submissionId,
      apiResponse: responseBody,
      apiStatusCode: response.status,
      error: parsedResponse.success ? undefined : parsedResponse.message
    };
  } catch (error: any) {
    console.error('[OrderEntry] ========== SUBMISSION FAILED ==========');
    console.error('[OrderEntry] Error:', error);
    console.error('[OrderEntry] Error message:', error.message);
    console.error('[OrderEntry] Error stack:', error.stack);
    console.error('[OrderEntry] Raw form data at failure:', JSON.stringify(formData, null, 2));

    const submissionId = await saveSubmission({
      userId,
      pdfId,
      submissionData: formData,
      rawFormData: formData,
      apiResponse: null,
      apiStatusCode: 0,
      status: 'failed',
      errorMessage: error.message || 'Failed to submit order'
    });

    return {
      success: false,
      submissionId,
      apiResponse: null,
      apiStatusCode: 0,
      error: error.message || 'Failed to submit order'
    };
  }
}

async function parseResponseBody(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return { message: text };
  } catch {
    return null;
  }
}

interface SaveSubmissionParams {
  userId: string;
  pdfId: string | null;
  submissionData: any;
  rawFormData?: any;
  apiResponse: any;
  apiStatusCode: number;
  status: string;
  errorMessage: string | null;
  extractionTypeId?: string | null;
}

async function saveSubmission(params: SaveSubmissionParams): Promise<string> {

  const { data, error } = await supabase
    .from('order_entry_submissions')
    .insert({
      user_id: params.userId,
      pdf_id: params.pdfId,
      submission_data: params.submissionData,
      raw_form_data: params.rawFormData || null,
      api_response: params.apiResponse,
      api_status_code: params.apiStatusCode,
      submission_status: params.status,
      error_message: params.errorMessage,
      extraction_type_id: params.extractionTypeId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('[OrderEntry:Save] Failed to save submission:', error);
    throw new Error('Failed to save submission record');
  }

  if (params.pdfId) {
    const { error: linkError } = await supabase
      .from('order_entry_pdfs')
      .update({ order_entry_submission_id: data.id })
      .eq('id', params.pdfId);

    if (linkError) {
      console.error('[OrderEntry:Save] Failed to link PDF:', linkError);
    }
  }

  return data.id;
}

async function triggerWorkflow(
  workflowId: string,
  submissionId: string,
  submissionData: any,
  apiResponse: any,
  apiStatusCode: number,
  pdfId: string | null
): Promise<string> {

  let pdfStoragePath = null;

  if (pdfId) {
    const { data: pdfData, error: pdfError } = await supabase
      .from('order_entry_pdfs')
      .select('storage_path')
      .eq('id', pdfId)
      .maybeSingle();

    if (pdfError) {
      console.error('[OrderEntry:Workflow] Failed to lookup PDF:', pdfError);
    }
    pdfStoragePath = pdfData?.storage_path || null;
  }

  const contextData = {
    submission_id: submissionId,
    submission_data: submissionData,
    api_response: apiResponse,
    api_status_code: apiStatusCode,
    pdf_storage_path: pdfStoragePath,
    pdf_id: pdfId,
    timestamp: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('workflow_execution_logs')
    .insert({
      workflow_id: workflowId,
      status: 'pending',
      context_data: contextData,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('[OrderEntry:Workflow] Failed to create workflow execution log:', error);
    throw new Error('Failed to trigger workflow');
  }

  await executeWorkflowSteps(workflowId, data.id, contextData);

  return data.id;
}

async function executeWorkflowSteps(
  workflowId: string,
  executionLogId: string,
  contextData: any
): Promise<void> {

  const { data: steps, error } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order');

  if (error) {
    console.error('[OrderEntry:Workflow] Failed to load workflow steps:', error);
  }

  if (!steps || steps.length === 0) {
    await supabase
      .from('workflow_execution_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', executionLogId);
    return;
  }

  await supabase
    .from('workflow_execution_logs')
    .update({
      status: 'running',
      current_step_id: steps[0].id,
      current_step_name: steps[0].step_name
    })
    .eq('id', executionLogId);

  for (const step of steps) {
    try {
      await executeWorkflowStep(step, executionLogId, contextData);
    } catch (error: any) {
      console.error('[OrderEntry:Workflow] Step failed:', step.step_name, error);

      await supabase
        .from('workflow_execution_logs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', executionLogId);

      throw error;
    }
  }

  await supabase
    .from('workflow_execution_logs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', executionLogId);
}

async function executeWorkflowStep(
  step: any,
  executionLogId: string,
  contextData: any
): Promise<void> {
  const startTime = Date.now();

  const { data: stepLog, error: logError } = await supabase
    .from('workflow_step_logs')
    .insert({
      workflow_execution_log_id: executionLogId,
      workflow_id: step.workflow_id,
      step_id: step.id,
      step_name: step.step_name,
      step_type: step.step_type,
      step_order: step.step_order,
      status: 'running',
      started_at: new Date().toISOString(),
      input_data: contextData,
      step_config: step.config_json
    })
    .select()
    .single();

  if (logError) {
    console.error('[OrderEntry:Step] Failed to create step log:', logError);
    throw new Error(`Failed to create step log: ${logError.message}`);
  }

  try {
    const config = replaceTemplateVariables(step.config_json, contextData);

    await supabase
      .from('workflow_step_logs')
      .update({
        processed_config: config,
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', stepLog.id);

    const output = await executeStepByType(step.step_type, config);

    const duration = Date.now() - startTime;

    await supabase
      .from('workflow_step_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        output_data: output
      })
      .eq('id', stepLog.id);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[OrderEntry:Step] Step failed after', duration, 'ms:', error);

    await supabase
      .from('workflow_step_logs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        error_message: error.message
      })
      .eq('id', stepLog.id);

    throw error;
  }
}

function replaceTemplateVariables(config: any, contextData: any): any {
  const configStr = JSON.stringify(config);

  const replaced = configStr.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(contextData, path.trim());
    return value !== undefined ? String(value) : match;
  });

  return JSON.parse(replaced);
}

function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
}

async function executeStepByType(stepType: string, config: any): Promise<any> {
  return { success: true, message: 'Step executed in background' };
}

async function linkWorkflowToSubmission(
  submissionId: string,
  workflowExecutionId: string
): Promise<void> {
  await supabase
    .from('order_entry_submissions')
    .update({ workflow_execution_log_id: workflowExecutionId })
    .eq('id', submissionId);
}

export async function loadExtractionTypeForOrderEntry(extractionTypeId: string): Promise<ExtractionType | null> {
  const { data, error } = await supabase
    .from('extraction_types')
    .select('*')
    .eq('id', extractionTypeId)
    .maybeSingle();

  if (error || !data) {
    console.error('Failed to load extraction type:', error);
    return null;
  }

  let fieldMappings = data.field_mappings || [];
  if (typeof fieldMappings === 'string') {
    try {
      fieldMappings = JSON.parse(fieldMappings);
    } catch (e) {
      console.error('Failed to parse field_mappings:', e);
      fieldMappings = [];
    }
  }

  return {
    id: data.id,
    name: data.name,
    defaultInstructions: data.default_instructions || '',
    formatTemplate: data.format_template || '',
    filename: data.filename || '',
    formatType: data.format_type || 'JSON',
    jsonPath: data.json_path,
    fieldMappings,
    workflowId: data.workflow_id,
    workflowVersion: data.workflow_version || 'v1',
    workflowV2Id: data.workflow_v2_id || undefined
  };
}

export function applyOrderEntryFieldMappings(
  formData: Record<string, any>,
  fieldMappings: FieldMapping[]
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const mapping of fieldMappings) {
    if (mapping.type === 'order_entry') {
      const formFieldName = mapping.value;
      let value = getNestedFormValue(formData, formFieldName);

      if (mapping.dataType === 'number') {
        value = value !== undefined && value !== '' ? parseFloat(value) : null;
      } else if (mapping.dataType === 'integer') {
        value = value !== undefined && value !== '' ? parseInt(value, 10) : null;
      } else if (mapping.dataType === 'boolean') {
        value = value === true || value === 'true' || value === '1';
      }

      if (mapping.removeIfNull && (value === null || value === undefined || value === '')) {
        continue;
      }

      result[mapping.fieldName] = value ?? '';
    } else if (mapping.type === 'hardcoded') {
      result[mapping.fieldName] = mapping.value;
    }
  }

  return result;
}

function getNestedFormValue(formData: Record<string, any>, path: string): any {
  const keys = path.split('.');
  let current: any = formData;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
}

async function injectArrayEntryHardcodedFields(
  extractedData: any,
  extractionTypeId: string
): Promise<void> {
  const { data: arrayEntries, error: entriesError } = await supabase
    .from('extraction_type_array_entries')
    .select('id, target_array_field, parent_array_field')
    .eq('extraction_type_id', extractionTypeId)
    .eq('is_enabled', true);

  if (entriesError || !arrayEntries || arrayEntries.length === 0) return;

  const entryIds = arrayEntries.map(e => e.id);
  const { data: allFields, error: fieldsError } = await supabase
    .from('extraction_type_array_entry_fields')
    .select('array_entry_id, field_name, hardcoded_value, field_type, data_type')
    .in('array_entry_id', entryIds)
    .eq('field_type', 'hardcoded');

  if (fieldsError || !allFields || allFields.length === 0) return;

  const hardcodedByEntry = new Map<string, { field_name: string; hardcoded_value: string; data_type?: string }[]>();
  for (const f of allFields) {
    const list = hardcodedByEntry.get(f.array_entry_id) || [];
    list.push({ field_name: f.field_name, hardcoded_value: f.hardcoded_value, data_type: f.data_type });
    hardcodedByEntry.set(f.array_entry_id, list);
  }

  const order = extractedData?.orders?.[0];
  if (!order) return;

  for (const entry of arrayEntries) {
    const hardcodedFields = hardcodedByEntry.get(entry.id);
    if (!hardcodedFields || hardcodedFields.length === 0) continue;

    if (entry.parent_array_field) {
      const parentArr = order[entry.parent_array_field];
      if (!Array.isArray(parentArr)) continue;
      for (const parentRow of parentArr) {
        const childArr = parentRow[entry.target_array_field];
        if (!Array.isArray(childArr)) continue;
        for (const childRow of childArr) {
          for (const hf of hardcodedFields) {
            let value: any = hf.hardcoded_value;
            if ((hf.data_type === 'number' || hf.data_type === 'integer') && value !== null && value !== '') {
              const numVal = parseFloat(value);
              if (!isNaN(numVal)) value = numVal;
            }
            childRow[hf.field_name] = value;
          }
        }
      }
    } else {
      const arr = order[entry.target_array_field];
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        for (const hf of hardcodedFields) {
          let value: any = hf.hardcoded_value;
          if ((hf.data_type === 'number' || hf.data_type === 'integer') && value !== null && value !== '') {
            const numVal = parseFloat(value);
            if (!isNaN(numVal)) value = numVal;
          }
          row[hf.field_name] = value;
        }
      }
    }
  }
}

async function coerceArrayEntryFieldTypes(
  extractedData: any,
  extractionTypeId: string
): Promise<void> {
  const { data: arrayEntries, error: entriesError } = await supabase
    .from('extraction_type_array_entries')
    .select('id, target_array_field, parent_array_field')
    .eq('extraction_type_id', extractionTypeId)
    .eq('is_enabled', true);

  if (entriesError || !arrayEntries || arrayEntries.length === 0) return;

  const entryIds = arrayEntries.map(e => e.id);
  const { data: allFields, error: fieldsError } = await supabase
    .from('extraction_type_array_entry_fields')
    .select('array_entry_id, field_name, data_type')
    .in('array_entry_id', entryIds)
    .in('data_type', ['integer', 'number']);

  if (fieldsError || !allFields || allFields.length === 0) return;

  const fieldsByEntry = new Map<string, { field_name: string; data_type: string }[]>();
  for (const f of allFields) {
    const list = fieldsByEntry.get(f.array_entry_id) || [];
    list.push({ field_name: f.field_name, data_type: f.data_type });
    fieldsByEntry.set(f.array_entry_id, list);
  }

  const order = extractedData?.orders?.[0];
  if (!order) return;

  const coerceRow = (row: any, numericFields: { field_name: string; data_type: string }[]) => {
    for (const nf of numericFields) {
      if (nf.field_name in row) {
        const raw = row[nf.field_name];
        if (raw !== null && raw !== undefined && raw !== '') {
          const numVal = nf.data_type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
          if (!isNaN(numVal)) {
            row[nf.field_name] = numVal;
          }
        }
      }
    }
  };

  for (const entry of arrayEntries) {
    const numericFields = fieldsByEntry.get(entry.id);
    if (!numericFields || numericFields.length === 0) continue;

    if (entry.parent_array_field) {
      const parentArr = order[entry.parent_array_field];
      if (!Array.isArray(parentArr)) continue;
      for (const parentRow of parentArr) {
        const childArr = parentRow[entry.target_array_field];
        if (!Array.isArray(childArr)) continue;
        for (const childRow of childArr) {
          coerceRow(childRow, numericFields);
        }
      }
    } else {
      const arr = order[entry.target_array_field];
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        coerceRow(row, numericFields);
      }
    }
  }
}

async function applyArrayEntryRinRemoval(
  extractedData: any,
  extractionTypeId: string
): Promise<void> {
  const { data: arrayEntries, error: entriesError } = await supabase
    .from('extraction_type_array_entries')
    .select('id, target_array_field, remove_entry_if_rin_null')
    .eq('extraction_type_id', extractionTypeId)
    .eq('is_enabled', true);

  if (entriesError || !arrayEntries || arrayEntries.length === 0) return;

  const entryIds = arrayEntries.map(e => e.id);
  const { data: rinFields, error: fieldsError } = await supabase
    .from('extraction_type_array_entry_fields')
    .select('array_entry_id, field_name, remove_if_null')
    .in('array_entry_id', entryIds)
    .eq('remove_if_null', true);

  if (fieldsError || !rinFields || rinFields.length === 0) return;

  const rinFieldsByEntry = new Map<string, string[]>();
  for (const f of rinFields) {
    const list = rinFieldsByEntry.get(f.array_entry_id) || [];
    list.push(f.field_name);
    rinFieldsByEntry.set(f.array_entry_id, list);
  }

  const order = extractedData?.orders?.[0];
  if (!order) return;

  for (const entry of arrayEntries) {
    const fieldNames = rinFieldsByEntry.get(entry.id);
    if (!fieldNames || fieldNames.length === 0) continue;

    const arr = order[entry.target_array_field];
    if (!Array.isArray(arr)) continue;

    const removeEntireEntry = entry.remove_entry_if_rin_null;

    const filteredArr: any[] = [];
    for (const row of arr) {
      let rinFieldWasNull = false;

      for (const fieldName of fieldNames) {
        const value = row[fieldName];
        if (value === null || value === undefined || value === '' || value === 'null') {
          rinFieldWasNull = true;
          delete row[fieldName];
        }
      }

      if (removeEntireEntry && rinFieldWasNull) {
        continue;
      }

      if (Object.keys(row).length > 0) {
        filteredArr.push(row);
      }
    }

    if (filteredArr.length > 0) {
      order[entry.target_array_field] = filteredArr;
    } else {
      delete order[entry.target_array_field];
    }
  }
}

async function submitViaExtractionType(
  formData: Record<string, any>,
  fields: OrderEntryField[],
  userId: string,
  pdfId: string | null,
  extractionTypeId: string,
  fieldGroups: OrderEntryFieldGroup[]
): Promise<SubmissionResult> {

  let submissionId = '';

  try {
    const extractionType = await loadExtractionTypeForOrderEntry(extractionTypeId);

    if (!extractionType) {
      throw new Error('Linked extraction type not found');
    }

    const extractedData = buildExtractedDataFromForm(formData, fields, fieldGroups, extractionType.fieldMappings || []);

    await injectArrayEntryHardcodedFields(extractedData, extractionTypeId);
    await coerceArrayEntryFieldTypes(extractedData, extractionTypeId);
    await applyArrayEntryRinRemoval(extractedData, extractionTypeId);

    // Log types of values in arrays to help debug invalidDouble errors
    const order = extractedData?.orders?.[0];
    if (order) {
      for (const key of Object.keys(order)) {
        if (Array.isArray(order[key])) {
        }
      }
    }

    const extractedDataString = JSON.stringify(extractedData, null, 2);

    submissionId = await saveSubmission({
      userId,
      pdfId,
      submissionData: extractedData,
      rawFormData: formData,
      apiResponse: null,
      apiStatusCode: 0,
      status: 'processing',
      errorMessage: null,
      extractionTypeId: extractionTypeId
    });

    const effectiveWorkflowId = extractionType.workflowVersion === 'v2'
      ? extractionType.workflowV2Id
      : extractionType.workflowId;

    if (!effectiveWorkflowId) {
      const { error: updateError } = await supabase
        .from('order_entry_submissions')
        .update({
          submission_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId);

      if (updateError) {
        console.error('[OrderEntry:ExtractionType] Failed to update submission status to completed:', updateError);
      }

      return {
        success: true,
        submissionId,
        apiResponse: extractedData,
        apiStatusCode: 200
      };
    }

    let submitterEmail = '';
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (userData?.email) {
        submitterEmail = userData.email;
      }
    } catch (emailLookupError) {
      console.warn('[OrderEntry:ExtractionType] Failed to look up user email:', emailLookupError);
    }

    let pdfBase64 = '';
    let pdfFilename = 'order-entry-submission.pdf';

    if (pdfId) {
      const { data: pdfData, error: pdfError } = await supabase
        .from('order_entry_pdfs')
        .select('storage_path, original_filename')
        .eq('id', pdfId)
        .maybeSingle();

      if (pdfError) {
        console.warn('[OrderEntry:ExtractionType] Failed to load PDF metadata:', pdfError);
      } else if (pdfData) {
        pdfFilename = pdfData.original_filename || pdfFilename;

        if (pdfData.storage_path) {
          try {
            let storagePath = pdfData.storage_path;
            if (storagePath.startsWith('http')) {
              const marker = '/object/public/order-entry-pdfs/';
              const idx = storagePath.indexOf(marker);
              if (idx !== -1) {
                storagePath = storagePath.substring(idx + marker.length);
              }
            }
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('order-entry-pdfs')
              .download(storagePath);

            if (!downloadError && fileData) {
              const buffer = await fileData.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              const chunkSize = 32768;
              for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                binary += String.fromCharCode.apply(null, Array.from(chunk));
              }
              pdfBase64 = btoa(binary);
            }
          } catch (downloadErr) {
            console.warn('[OrderEntry:ExtractionType] Failed to download PDF for workflow:', downloadErr);
          }
        }
      }
    }

    const workflowResult = await executeWorkflow({
      extractedData: extractedDataString,
      workflowId: effectiveWorkflowId,
      userId: userId,
      extractionTypeId: extractionType.id,
      pdfFilename: pdfFilename,
      pdfPages: 1,
      pdfBase64: pdfBase64,
      originalPdfFilename: pdfFilename,
      formatType: extractionType.formatType || 'JSON',
      extractionTypeFilename: extractionType.filename,
      submitterEmail: submitterEmail,
      workflowVersion: extractionType.workflowVersion as 'v1' | 'v2' | undefined
    });

    // Build apiResponse: merge mapped response values from finalData on top of raw API response.
    // Response data mappings from API CALL steps store values at contextData[field] (top-level of finalData).
    // Response data mappings from API ENDPOINT steps store values at contextData.response[field].
    // We extract simple scalar values from both locations to ensure they're available to the UI.
    let apiResponseForSubmission: any = workflowResult.lastApiResponse || {};
    if (workflowResult.finalData && typeof workflowResult.finalData === 'object') {
      const mappedValues: Record<string, any> = {};
      // Collect from finalData.response (API ENDPOINT step mappings)
      if (workflowResult.finalData.response && typeof workflowResult.finalData.response === 'object') {
        for (const [key, val] of Object.entries(workflowResult.finalData.response)) {
          if (val !== null && val !== undefined && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
            mappedValues[key] = val;
          }
        }
      }
      // Collect from finalData top-level (API CALL step mappings)
      const skipKeys = new Set(['extractedData', 'response', 'pdfBase64', 'pdfFilename', 'originalPdfFilename', 'formatType', 'extractionTypeFilename', 'actualFilename', 'renamedFilename', 'userMessage', 'submitterEmail']);
      for (const [key, val] of Object.entries(workflowResult.finalData)) {
        if (skipKeys.has(key)) continue;
        if (val !== null && val !== undefined && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
          mappedValues[key] = val;
        }
      }
      if (Object.keys(mappedValues).length > 0) {
        apiResponseForSubmission = {
          ...(typeof apiResponseForSubmission === 'object' ? apiResponseForSubmission : {}),
          ...mappedValues
        };
      }
    }

    const updatePayload: Record<string, unknown> = {
      api_response: apiResponseForSubmission,
      api_status_code: 200,
      submission_status: 'completed',
      updated_at: new Date().toISOString()
    };

    if (extractionType.workflowVersion === 'v2') {
      updatePayload.workflow_v2_execution_log_id = workflowResult.workflowExecutionLogId;
    } else {
      updatePayload.workflow_execution_log_id = workflowResult.workflowExecutionLogId;
    }

    const { error: updateError } = await supabase
      .from('order_entry_submissions')
      .update(updatePayload)
      .eq('id', submissionId);

    if (updateError) {
      console.error('[OrderEntry:ExtractionType] Failed to update submission after workflow:', updateError);
    }

    return {
      success: true,
      submissionId,
      apiResponse: apiResponseForSubmission,
      apiStatusCode: 200,
      workflowExecutionId: workflowResult.workflowExecutionLogId
    };

  } catch (error: any) {
    console.error('[OrderEntry:ExtractionType] ========== SUBMISSION FAILED ==========');
    console.error('[OrderEntry:ExtractionType] Error:', error);
    console.error('[OrderEntry:ExtractionType] Error message:', error.message);
    console.error('[OrderEntry:ExtractionType] Raw form data at failure:', JSON.stringify(formData, null, 2));

    if (submissionId) {
      await supabase
        .from('order_entry_submissions')
        .update({
          submission_status: 'failed',
          error_message: error.message || 'Failed to submit order via extraction type',
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId);
    } else {
      let mappedDataAttempt: any = null;
      try {
        const extractionType = await loadExtractionTypeForOrderEntry(extractionTypeId);
        if (extractionType) {
          mappedDataAttempt = buildExtractedDataFromForm(formData, fields, [], extractionType.fieldMappings || []);
        }
      } catch (mappingError) {
        console.error('[OrderEntry:ExtractionType] Could not compute mapped data:', mappingError);
      }

      submissionId = await saveSubmission({
        userId,
        pdfId,
        submissionData: mappedDataAttempt || formData,
        rawFormData: formData,
        apiResponse: null,
        apiStatusCode: 0,
        status: 'failed',
        errorMessage: error.message || 'Failed to submit order via extraction type',
        extractionTypeId: extractionTypeId
      });
    }

    return {
      success: false,
      submissionId,
      apiResponse: null,
      apiStatusCode: 0,
      error: error.message || 'Failed to submit order via extraction type'
    };
  }
}

function buildExtractedDataFromForm(
  formData: Record<string, any>,
  fields: OrderEntryField[],
  fieldGroups: OrderEntryFieldGroup[],
  fieldMappings: FieldMapping[]
): Record<string, any> {

  fieldMappings.forEach((m, idx) => {
  });

  Object.keys(formData).forEach(key => {
    const value = formData[key];
    const isArray = Array.isArray(value);
  });

  const result: Record<string, any> = {};

  const orderEntryMappings = fieldMappings.filter(m => m.type === 'order_entry');

  fieldGroups.forEach((g, i) => {
  });

  const arrayGroupIds = new Set(fieldGroups.filter(g => g.isArrayGroup).map(g => g.id));

  const arrayGroupFieldsByRoot: Map<string, { groupId: string; fields: OrderEntryField[] }> = new Map();

  const childGroupIds = new Set(fieldGroups.filter(g => g.parentGroupId).map(g => g.id));

  for (const field of fields) {
    if (childGroupIds.has(field.fieldGroupId)) {
      continue;
    }

    if (!field.jsonPath) {
      continue;
    }

    const isInArrayGroup = arrayGroupIds.has(field.fieldGroupId);

    if (isInArrayGroup) {
      const pathParts = field.jsonPath.split('.');
      const rootPath = pathParts[0];

      if (!arrayGroupFieldsByRoot.has(rootPath)) {
        arrayGroupFieldsByRoot.set(rootPath, { groupId: field.fieldGroupId, fields: [] });
      }
      arrayGroupFieldsByRoot.get(rootPath)!.fields.push(field);
    } else {
      const formValue = formData[field.fieldName];

      const mapping = orderEntryMappings.find(m => m.fieldName === field.jsonPath);
      let processedValue = formValue;

      if (mapping) {
        processedValue = applyMappingDataType(processedValue, mapping);
        if (mapping.removeIfNull && (processedValue === null || processedValue === undefined || processedValue === '')) {
          continue;
        }
      } else if (field.fieldType === 'boolean' && typeof processedValue === 'boolean') {
        processedValue = processedValue ? 'True' : 'False';
      } else if (field.fieldType === 'number' && processedValue !== undefined && processedValue !== null && processedValue !== '') {
        const numVal = parseFloat(processedValue);
        if (!isNaN(numVal)) {
          processedValue = numVal;
        }
      }

      setNestedValue(result, field.jsonPath, processedValue ?? '');
    }
  }

  for (const mapping of orderEntryMappings) {
    const formFieldName = mapping.value;
    const templateField = fields.find(f => f.fieldName === formFieldName);

    if (templateField && arrayGroupIds.has(templateField.fieldGroupId)) {
      const rootPath = mapping.fieldName.split('.')[0];

      if (!arrayGroupFieldsByRoot.has(rootPath)) {
        arrayGroupFieldsByRoot.set(rootPath, {
          groupId: templateField.fieldGroupId,
          fields: []
        });
      }
    }
  }

  for (const [rootPath, { groupId, fields: collectedFields }] of arrayGroupFieldsByRoot) {
  }

  fieldMappings.forEach((m, idx) => {
    const isHardcoded = m.type === 'hardcoded';
    const typeComparison = `"${m.type}" === "hardcoded" -> ${isHardcoded}`;
  });

  const hardcodedMappings = fieldMappings.filter(m => m.type === 'hardcoded');
  if (hardcodedMappings.length === 0) {
  }
  hardcodedMappings.forEach(m => {
  });

  const arrayRootPaths = new Set(arrayGroupFieldsByRoot.keys());

  const hardcodedByArrayRoot: Map<string, FieldMapping[]> = new Map();
  const rootLevelHardcoded: FieldMapping[] = [];

  for (const mapping of hardcodedMappings) {
    const pathParts = mapping.fieldName.split('.');
    const rootPath = pathParts[0];
    const hasArrayRootPath = arrayRootPaths.has(rootPath);
    const hasMultipleParts = pathParts.length > 1;
    const belongsToArray = hasArrayRootPath && hasMultipleParts;

    if (belongsToArray) {
      if (!hardcodedByArrayRoot.has(rootPath)) {
        hardcodedByArrayRoot.set(rootPath, []);
      }
      hardcodedByArrayRoot.get(rootPath)!.push(mapping);
    } else {
      rootLevelHardcoded.push(mapping);
    }
  }

  for (const [root, mappings] of hardcodedByArrayRoot) {
  }

  for (const [rootPath, { groupId, fields: arrayFields }] of arrayGroupFieldsByRoot) {
    const groupDef = fieldGroups.find(g => g.id === groupId);
    if (groupDef?.parentGroupId) {
      continue;
    }

    const arrayData = formData[groupId];
    if (Array.isArray(arrayData) && arrayData.length > 0) {
    }
    const rowCount = Array.isArray(arrayData) ? arrayData.length : 1;

    const hardcodedForThisArray = hardcodedByArrayRoot.get(rootPath) || [];
    if (hardcodedForThisArray.length > 0) {
    } else {
    }

    const groupDef2 = fieldGroups.find(g => g.id === groupId);
    const groupRemoveIfEmpty = groupDef2?.removeIfEmpty || false;

    const arrayResult: Record<string, any>[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const rowData: Record<string, any> = {};
      let hasUserEnteredValue = false;

      for (const field of arrayFields) {
        const pathParts = field.jsonPath.split('.');
        const fieldPathWithinArray = pathParts.slice(1).join('.');

        let formValue: any;
        if (Array.isArray(arrayData) && arrayData[rowIndex]) {
          formValue = arrayData[rowIndex][field.fieldName];
        } else {
          formValue = formData[field.fieldName];
        }

        if (formValue !== undefined && formValue !== null && formValue !== '' && formValue !== false) {
          hasUserEnteredValue = true;
        }

        const mapping = orderEntryMappings.find(m => m.fieldName === field.jsonPath);
        let processedValue = formValue;

        if (mapping) {
          processedValue = applyMappingDataType(processedValue, mapping);
          if (mapping.removeIfNull && (processedValue === null || processedValue === undefined || processedValue === '')) {
            continue;
          }
        } else if (field.fieldType === 'boolean' && typeof processedValue === 'boolean') {
          processedValue = processedValue ? 'True' : 'False';
        } else if (field.fieldType === 'number' && processedValue !== undefined && processedValue !== null && processedValue !== '') {
          const numVal = parseFloat(processedValue);
          if (!isNaN(numVal)) {
            processedValue = numVal;
          }
        }

        if (fieldPathWithinArray.includes('.')) {
          setNestedValue(rowData, fieldPathWithinArray, processedValue ?? '');
        } else {
          rowData[fieldPathWithinArray] = processedValue ?? '';
        }

      }

      if (groupRemoveIfEmpty && !hasUserEnteredValue) {
        continue;
      }

      for (const hardcodedMapping of hardcodedForThisArray) {
        const pathParts = hardcodedMapping.fieldName.split('.');
        const fieldPathWithinArray = pathParts.slice(1).join('.');

        const processedHardcodedValue = applyMappingDataType(hardcodedMapping.value, hardcodedMapping);

        if (fieldPathWithinArray.includes('.')) {
          setNestedValue(rowData, fieldPathWithinArray, processedHardcodedValue);
        } else {
          rowData[fieldPathWithinArray] = processedHardcodedValue;
        }

      }

      const childGroups = fieldGroups.filter(g => g.parentGroupId === groupId);

      // Inject count for fields configured with countChildArrayRecords
      const countFields = arrayFields.filter(f => f.countChildArrayRecords && f.countChildArrayGroupId);
      for (const countField of countFields) {
        const childKey = `_child_${countField.countChildArrayGroupId}`;
        const childData = Array.isArray(arrayData) && arrayData[rowIndex] ? arrayData[rowIndex][childKey] : [];
        const count = Array.isArray(childData) ? childData.length : 0;
        const pathParts = countField.jsonPath ? countField.jsonPath.split('.') : [countField.fieldName];
        const fieldPathWithinArray = pathParts.slice(1).join('.') || pathParts[0];
        if (fieldPathWithinArray.includes('.')) {
          setNestedValue(rowData, fieldPathWithinArray, count);
        } else {
          rowData[fieldPathWithinArray] = count;
        }
      }
      if (Array.isArray(arrayData) && arrayData[rowIndex]) {
        const rowKeys = Object.keys(arrayData[rowIndex]);
        const childKeys = rowKeys.filter(k => k.startsWith('_child_'));
        childKeys.forEach(ck => {
          const val = arrayData[rowIndex][ck];
        });
      } else {
      }
      for (const childGroup of childGroups) {
        const childKey = `_child_${childGroup.id}`;
        const childData = Array.isArray(arrayData) && arrayData[rowIndex] ? arrayData[rowIndex][childKey] : [];
        if (Array.isArray(childData) && childData.length > 0) {
          const childFields = fields.filter(f => f.fieldGroupId === childGroup.id);
          const childArrayResult: Record<string, any>[] = [];

          for (const childRow of childData) {
            const childRowData: Record<string, any> = {};
            for (const childField of childFields) {
              const childFieldPath = childField.jsonPath
                ? childField.jsonPath.split('.').pop()!
                : childField.fieldName.toLowerCase();
              let childValue = childRow[childField.fieldName];

              const childMappingKey = childField.jsonPath || `${childGroup.arrayJsonPath || childGroup.groupName.toLowerCase()}.${childFieldPath}`;
              const childMapping = orderEntryMappings.find(m => m.fieldName === childMappingKey);
              if (childMapping) {
                childValue = applyMappingDataType(childValue, childMapping);
                if (childMapping.removeIfNull && (childValue === null || childValue === undefined || childValue === '')) {
                  continue;
                }
              } else if (childField.fieldType === 'boolean' && typeof childValue === 'boolean') {
                childValue = childValue ? 'True' : 'False';
              } else if (childField.fieldType === 'number' && childValue !== undefined && childValue !== null && childValue !== '') {
                const numVal = parseFloat(childValue);
                if (!isNaN(numVal)) childValue = numVal;
              }

              childRowData[childFieldPath] = childValue ?? '';
            }
            if (Object.keys(childRowData).length > 0) {
              childArrayResult.push(childRowData);
            }
          }

          if (childArrayResult.length > 0) {
            const childJsonPath = childGroup.arrayJsonPath || childGroup.groupName.toLowerCase();
            const childPathParts = childJsonPath.replace(/\[\]$/, '').split('.');
            const childPathWithinParent = childPathParts[childPathParts.length - 1];
            rowData[childPathWithinParent] = childArrayResult;
          } else {
          }
        } else {
        }
      }

      if (Object.keys(rowData).length > 0) {
        arrayResult.push(rowData);
      } else {
      }
    }

    if (arrayResult.length > 0) {
      setNestedValue(result, rootPath, arrayResult);
    } else {
    }
  }

  for (const mapping of rootLevelHardcoded) {
    const processedValue = applyMappingDataType(mapping.value, mapping);
    setNestedValue(result, mapping.fieldName, processedValue);
  }

  const wrappedResult = { orders: [result] };

  const processedResult = applyFieldMappingPostProcessing(wrappedResult, fieldMappings);
  return processedResult;
}

function applyMappingDataType(value: any, mapping: FieldMapping): any {
  let processedValue = value;

  if (mapping.dataType === 'number' && processedValue !== undefined && processedValue !== '') {
    processedValue = parseFloat(processedValue);
    if (isNaN(processedValue)) processedValue = null;
  } else if (mapping.dataType === 'integer' && processedValue !== undefined && processedValue !== '') {
    processedValue = parseInt(processedValue, 10);
    if (isNaN(processedValue)) processedValue = null;
  } else if (mapping.dataType === 'boolean') {
    const boolVal = processedValue === true || processedValue === 'true' || processedValue === '1' || processedValue === 'True';
    processedValue = boolVal ? 'True' : 'False';
  }

  return processedValue;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}
