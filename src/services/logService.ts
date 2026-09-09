import { supabase } from '../lib/supabase';
import type { ExtractionLog, EmailPollingLog, WorkflowExecutionLog, SftpPollingLog, ProcessedEmail } from '../types';

export interface WorkflowStepLog {
  id: string;
  workflowExecutionLogId: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  stepType: string;
  stepOrder: number;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  inputData: any;
  outputData: any;
  userResponse: string | null;
  createdAt: string;
}

// Extraction Logs
export async function fetchExtractionLogs(): Promise<ExtractionLog[]> {
  try {
    const { data, error } = await supabase
      .from('extraction_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map(log => ({
      id: log.id,
      userId: log.user_id,
      extractionTypeId: log.extraction_type_id,
      transformationTypeId: log.transformation_type_id,
      pdfFilename: log.pdf_filename,
      pdfPages: log.pdf_pages,
      extractionStatus: log.extraction_status,
      errorMessage: log.error_message,
      createdAt: log.created_at,
      apiResponse: log.api_response,
      apiStatusCode: log.api_status_code,
      apiError: log.api_error,
      extractedData: log.extracted_data,
      processingMode: log.processing_mode,
      executeButtonId: log.execute_button_id,
      executeButtonName: log.execute_button_name
    }));
  } catch (error) {
    console.error('Error fetching extraction logs:', error);
    throw error;
  }
}

export async function refreshLogsWithFilters(filters: {
  statusFilter: string;
  userFilter: string;
  typeFilter: string;
  processingModeFilter: string;
  fromDate: string;
  toDate: string;
}): Promise<ExtractionLog[]> {
  try {
    let query = supabase
      .from('extraction_logs')
      .select('*');

    // Apply filters
    if (filters.statusFilter !== 'all') {
      query = query.eq('extraction_status', filters.statusFilter);
    }

    if (filters.userFilter !== 'all') {
      query = query.eq('user_id', filters.userFilter);
    }

    if (filters.processingModeFilter !== 'all') {
      query = query.eq('processing_mode', filters.processingModeFilter);
    }

    if (filters.typeFilter !== 'all') {
      const [mode, typeId] = filters.typeFilter.split('-');
      if (mode === 'extraction') {
        query = query.eq('extraction_type_id', typeId);
      } else if (mode === 'transformation') {
        query = query.eq('transformation_type_id', typeId);
      }
    }

    if (filters.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }

    if (filters.toDate) {
      const toDateEnd = new Date(filters.toDate);
      toDateEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toDateEnd.toISOString());
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    return (data || []).map(log => ({
      id: log.id,
      userId: log.user_id,
      extractionTypeId: log.extraction_type_id,
      transformationTypeId: log.transformation_type_id,
      pdfFilename: log.pdf_filename,
      pdfPages: log.pdf_pages,
      extractionStatus: log.extraction_status,
      errorMessage: log.error_message,
      createdAt: log.created_at,
      apiResponse: log.api_response,
      apiStatusCode: log.api_status_code,
      apiError: log.api_error,
      extractedData: log.extracted_data,
      processingMode: log.processing_mode,
      executeButtonId: log.execute_button_id,
      executeButtonName: log.execute_button_name
    }));
  } catch (error) {
    console.error('Error refreshing logs with filters:', error);
    throw error;
  }
}

export async function logExtraction(
  extractionTypeId: string | null,
  transformationTypeId: string | null,
  pdfFilename: string,
  pdfPages: number,
  status: 'success' | 'failed',
  errorMessage?: string,
  userId?: string,
  apiResponse?: string,
  apiStatusCode?: number,
  apiError?: string,
  extractedData?: string,
  processingMode: 'extraction' | 'transformation' = 'extraction'
): Promise<void> {
  try {
    const { error } = await supabase
      .from('extraction_logs')
      .insert([{
        user_id: userId || null,
        extraction_type_id: extractionTypeId,
        transformation_type_id: transformationTypeId,
        pdf_filename: pdfFilename,
        pdf_pages: pdfPages,
        extraction_status: status,
        error_message: errorMessage || null,
        api_response: apiResponse || null,
        api_status_code: apiStatusCode || null,
        api_error: apiError || null,
        extracted_data: extractedData || null,
        processing_mode: processingMode,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;
  } catch (error) {
    console.error('Error logging extraction:', error);
    throw error;
  }
}

// Email Polling Logs
export async function fetchEmailPollingLogs(): Promise<EmailPollingLog[]> {
  try {
    const { data, error } = await supabase
      .from('email_polling_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      provider: log.provider,
      status: log.status,
      emailsFound: log.emails_found,
      emailsProcessed: log.emails_processed,
      emailsSkipped: log.emails_skipped || 0,
      emailsFailed: log.emails_failed || 0,
      errorMessage: log.error_message,
      executionTimeMs: log.execution_time_ms,
      createdAt: log.created_at
    }));
  } catch (error) {
    console.error('Error fetching email polling logs:', error);
    throw error;
  }
}

export async function stopRunningPollingLogs(): Promise<number> {
  const { data, error } = await supabase
    .from('email_polling_logs')
    .update({ status: 'failed', error_message: 'Manually stopped by user' })
    .eq('status', 'running')
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// Workflow Execution Logs
export async function fetchWorkflowExecutionLogs(): Promise<WorkflowExecutionLog[]> {
  try {
    const [v1Result, v2Result] = await Promise.all([
      supabase
        .from('workflow_execution_logs')
        .select(`
          id,
          extraction_log_id,
          workflow_id,
          status,
          current_step_id,
          current_step_name,
          error_message,
          started_at,
          updated_at,
          completed_at,
          extraction_logs!extraction_log_id (
            user_id,
            processing_mode,
            extraction_type_id,
            transformation_type_id
          )
        `)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('workflow_v2_execution_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100)
    ]);

    if (v1Result.error) throw v1Result.error;

    const v1Logs: WorkflowExecutionLog[] = (v1Result.data || []).map(log => {
      const extractionLog = log.extraction_logs as any;
      return {
        id: log.id,
        extractionLogId: log.extraction_log_id,
        workflowId: log.workflow_id,
        status: log.status,
        currentStepId: log.current_step_id,
        currentStepName: log.current_step_name,
        errorMessage: log.error_message,
        contextData: null,
        createdAt: log.started_at,
        startedAt: log.started_at,
        updatedAt: log.updated_at,
        completedAt: log.completed_at,
        userId: extractionLog?.user_id || null,
        processingMode: extractionLog?.processing_mode || null,
        extractionTypeId: extractionLog?.extraction_type_id || null,
        transformationTypeId: extractionLog?.transformation_type_id || null
      };
    });

    const v2Logs: WorkflowExecutionLog[] = (v2Result.data || []).map(log => ({
      id: log.id,
      extractionLogId: log.extraction_log_id,
      workflowId: log.workflow_id,
      status: log.status,
      currentStepId: log.current_node_id,
      currentStepName: log.current_node_label,
      errorMessage: log.error_message,
      contextData: null,
      createdAt: log.started_at,
      startedAt: log.started_at,
      updatedAt: log.updated_at,
      completedAt: log.completed_at,
      userId: log.user_id || null,
      processingMode: log.processing_mode || null,
      extractionTypeId: log.extraction_type_id || null,
      transformationTypeId: log.transformation_type_id || null,
      failureNotificationSent: log.failure_notification_sent || false,
      successNotificationSent: log.success_notification_sent || false,
      _isV2: true,
    } as WorkflowExecutionLog));

    const merged = [...v1Logs, ...v2Logs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    return merged.slice(0, 200);
  } catch (error) {
    console.error('Error fetching workflow execution logs:', error);
    throw error;
  }
}

export async function fetchWorkflowExecutionLogsByDateRange(
  fromDate: string | null,
  toDate: string | null
): Promise<WorkflowExecutionLog[]> {
  try {
    const toIso = (d: string, endOfDay: boolean): string => {
      const [y, m, day] = d.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, day || 1, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
      return dt.toISOString();
    };

    const fromIso = fromDate ? toIso(fromDate, false) : null;
    const toIsoStr = toDate ? toIso(toDate, true) : null;

    let v1Query = supabase
      .from('workflow_execution_logs')
      .select(`
        id,
        extraction_log_id,
        workflow_id,
        status,
        current_step_id,
        current_step_name,
        error_message,
        started_at,
        updated_at,
        completed_at,
        extraction_logs!extraction_log_id (
          user_id,
          processing_mode,
          extraction_type_id,
          transformation_type_id
        )
      `)
      .order('started_at', { ascending: false })
      .limit(2000);

    let v2Query = supabase
      .from('workflow_v2_execution_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(2000);

    if (fromIso) {
      v1Query = v1Query.gte('started_at', fromIso);
      v2Query = v2Query.gte('started_at', fromIso);
    }
    if (toIsoStr) {
      v1Query = v1Query.lte('started_at', toIsoStr);
      v2Query = v2Query.lte('started_at', toIsoStr);
    }

    const [v1Result, v2Result] = await Promise.all([v1Query, v2Query]);

    if (v1Result.error) throw v1Result.error;
    if (v2Result.error) throw v2Result.error;

    const v1Logs: WorkflowExecutionLog[] = (v1Result.data || []).map((log: any) => {
      const extractionLog = log.extraction_logs as any;
      return {
        id: log.id,
        extractionLogId: log.extraction_log_id,
        workflowId: log.workflow_id,
        status: log.status,
        currentStepId: log.current_step_id,
        currentStepName: log.current_step_name,
        errorMessage: log.error_message,
        contextData: null,
        createdAt: log.started_at,
        startedAt: log.started_at,
        updatedAt: log.updated_at,
        completedAt: log.completed_at,
        userId: extractionLog?.user_id || null,
        processingMode: extractionLog?.processing_mode || null,
        extractionTypeId: extractionLog?.extraction_type_id || null,
        transformationTypeId: extractionLog?.transformation_type_id || null
      };
    });

    const v2Logs: WorkflowExecutionLog[] = (v2Result.data || []).map((log: any) => ({
      id: log.id,
      extractionLogId: log.extraction_log_id,
      workflowId: log.workflow_id,
      status: log.status,
      currentStepId: log.current_node_id,
      currentStepName: log.current_node_label,
      errorMessage: log.error_message,
      contextData: null,
      createdAt: log.started_at,
      startedAt: log.started_at,
      updatedAt: log.updated_at,
      completedAt: log.completed_at,
      userId: log.user_id || null,
      processingMode: log.processing_mode || null,
      extractionTypeId: log.extraction_type_id || null,
      transformationTypeId: log.transformation_type_id || null,
      failureNotificationSent: log.failure_notification_sent || false,
      successNotificationSent: log.success_notification_sent || false,
      _isV2: true,
    } as WorkflowExecutionLog));

    return [...v1Logs, ...v2Logs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  } catch (error) {
    console.error('Error fetching workflow execution logs by date range:', error);
    throw error;
  }
}

export async function fetchWorkflowExecutionLogById(id: string): Promise<WorkflowExecutionLog | null> {
  try {
    const { data, error } = await supabase
      .from('workflow_execution_logs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (data) {
      return {
        id: data.id,
        extractionLogId: data.extraction_log_id,
        workflowId: data.workflow_id,
        status: data.status,
        currentStepId: data.current_step_id,
        currentStepName: data.current_step_name,
        errorMessage: data.error_message,
        contextData: data.context_data,
        startedAt: data.started_at,
        updatedAt: data.updated_at,
        completedAt: data.completed_at
      };
    }

    if (error && error.code !== 'PGRST116') throw error;

    const { data: v2Data, error: v2Error } = await supabase
      .from('workflow_v2_execution_logs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (v2Error) throw v2Error;
    if (!v2Data) return null;

    return {
      id: v2Data.id,
      extractionLogId: v2Data.extraction_log_id,
      workflowId: v2Data.workflow_id,
      status: v2Data.status,
      currentStepId: v2Data.current_node_id,
      currentStepName: v2Data.current_node_label,
      errorMessage: v2Data.error_message,
      contextData: v2Data.context_data,
      startedAt: v2Data.started_at,
      updatedAt: v2Data.updated_at,
      completedAt: v2Data.completed_at,
      userId: v2Data.user_id,
      processingMode: v2Data.processing_mode,
      extractionTypeId: v2Data.extraction_type_id,
      transformationTypeId: v2Data.transformation_type_id,
    };
  } catch (error) {
    console.error('Error fetching workflow execution log by ID:', error);
    throw error;
  }
}

// SFTP Polling Logs
export async function fetchSftpPollingLogs(): Promise<SftpPollingLog[]> {
  try {
    const { data, error } = await supabase
      .from('sftp_polling_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map(log => ({
      id: log.id,
      configId: log.config_id,
      timestamp: log.timestamp,
      status: log.status,
      filesFound: log.files_found,
      filesProcessed: log.files_processed,
      errorMessage: log.error_message,
      executionTimeMs: log.execution_time_ms,
      createdAt: log.created_at
    }));
  } catch (error) {
    console.error('Error fetching SFTP polling logs:', error);
    throw error;
  }
}

// Processed Emails
export async function fetchProcessedEmails(startDate?: string, endDate?: string): Promise<ProcessedEmail[]> {
  try {
    let query = supabase
      .from('processed_emails')
      .select('*');

    if (startDate) {
      query = query.gte('received_date', `${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query = query.lte('received_date', `${endDate}T23:59:59.999Z`);
    }

    const { data, error } = await query
      .order('processed_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map(email => ({
      id: email.id,
      emailId: email.email_id,
      sender: email.sender,
      subject: email.subject,
      receivedDate: email.received_date,
      processingRuleId: email.processing_rule_id,
      extractionTypeId: email.extraction_type_id,
      processingMode: email.processing_mode,
      direction: email.direction || 'inbound',
      pdfFilename: email.pdf_filename,
      attachmentCount: email.attachment_count,
      pdfFilenames: email.pdf_filenames,
      attachmentPageCounts: email.attachment_page_counts,
      processingStatus: email.processing_status,
      errorMessage: email.error_message,
      parseitId: email.parseit_id,
      processedAt: email.processed_at
    }));
  } catch (error) {
    console.error('Error fetching processed emails:', error);
    throw error;
  }
}

// Workflow Step Logs
export async function fetchWorkflowStepLogs(): Promise<WorkflowStepLog[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_step_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    return (data || []).map(log => ({
      id: log.id,
      workflowExecutionLogId: log.workflow_execution_log_id,
      workflowId: log.workflow_id,
      stepId: log.step_id,
      stepName: log.step_name,
      stepType: log.step_type,
      stepOrder: log.step_order,
      status: log.status,
      startedAt: log.started_at,
      completedAt: log.completed_at,
      durationMs: log.duration_ms,
      errorMessage: log.error_message,
      inputData: log.input_data,
      outputData: log.output_data,
      userResponse: log.user_response,
      createdAt: log.created_at
    }));
  } catch (error) {
    console.error('Error fetching workflow step logs:', error);
    throw error;
  }
}

export async function fetchWorkflowStepLogsByExecutionId(executionLogId: string): Promise<WorkflowStepLog[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_step_logs')
      .select('*')
      .eq('workflow_execution_log_id', executionLogId)
      .order('step_order', { ascending: true });

    if (data && data.length > 0) {
      return data.map(log => ({
        id: log.id,
        workflowExecutionLogId: log.workflow_execution_log_id,
        workflowId: log.workflow_id,
        stepId: log.step_id,
        stepName: log.step_name,
        stepType: log.step_type,
        stepOrder: log.step_order,
        status: log.status,
        startedAt: log.started_at,
        completedAt: log.completed_at,
        durationMs: log.duration_ms,
        errorMessage: log.error_message,
        inputData: log.input_data,
        outputData: log.output_data,
        userResponse: log.user_response,
        createdAt: log.created_at
      }));
    }

    if (error && error.code !== 'PGRST116') throw error;

    const { data: v2Data, error: v2Error } = await supabase
      .from('workflow_v2_step_logs')
      .select('*')
      .eq('execution_log_id', executionLogId)
      .order('created_at', { ascending: true });

    if (v2Error) throw v2Error;

    return (v2Data || []).map((log, index) => ({
      id: log.id,
      workflowExecutionLogId: log.execution_log_id,
      workflowId: log.workflow_id,
      stepId: log.node_id,
      stepName: log.node_label || 'Step',
      stepType: log.step_type || '',
      stepOrder: index + 1,
      status: log.status,
      startedAt: log.started_at,
      completedAt: log.completed_at,
      durationMs: log.duration_ms,
      errorMessage: log.error_message,
      inputData: log.input_data,
      outputData: log.output_data,
      userResponse: log.user_response || null,
      createdAt: log.created_at
    }));
  } catch (error) {
    console.error('Error fetching workflow step logs by execution ID:', error);
    throw error;
  }
}