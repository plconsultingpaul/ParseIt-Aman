import { isValidUuid } from "../utils/validation.ts";

export async function createExecutionLog(
  supabaseUrl: string,
  supabaseServiceKey: string,
  buttonId: string,
  buttonName: string,
  userId: string | null,
  isFlowBased: boolean
): Promise<{ extractionLogId: string | null; executionLogId: string | null }> {
  let extractionLogId: string | null = null;
  let executionLogId: string | null = null;
  const safeUserId = isValidUuid(userId) ? userId : null;

  try {
    const elRes = await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        user_id: safeUserId,
        extraction_type_id: null,
        transformation_type_id: null,
        pdf_filename: buttonName,
        pdf_pages: 0,
        extraction_status: 'success',
        processing_mode: 'execute',
        execute_button_id: buttonId,
        execute_button_name: buttonName,
        created_at: new Date().toISOString()
      })
    });
    if (elRes.ok) {
      const elData = await elRes.json();
      extractionLogId = elData?.[0]?.id || null;
    } else {
      console.error('extraction_logs INSERT failed:', elRes.status, await elRes.text());
    }
  } catch (e) {
    console.error('Failed to create extraction log:', e);
  }

  try {
    const wlRes = await fetch(`${supabaseUrl}/rest/v1/workflow_v2_execution_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        workflow_id: buttonId,
        extraction_log_id: extractionLogId,
        status: 'running',
        current_node_label: isFlowBased ? 'Flow Started' : 'Steps Started',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: safeUserId,
        processing_mode: 'execute',
        context_data: { buttonId, buttonName }
      })
    });
    if (wlRes.ok) {
      const wlData = await wlRes.json();
      executionLogId = wlData?.[0]?.id || null;
    } else {
      console.error('workflow_v2_execution_logs INSERT failed:', wlRes.status, await wlRes.text());
    }
  } catch (e) {
    console.error('Failed to create execution log:', e);
  }

  return { extractionLogId, executionLogId };
}

export async function finalizeExecutionLog(
  supabaseUrl: string,
  supabaseServiceKey: string,
  extractionLogId: string | null,
  executionLogId: string | null,
  success: boolean,
  errorMessage: string | null,
  stepResults: any[],
  contextData: any
): Promise<void> {
  const now = new Date().toISOString();

  if (extractionLogId) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/extraction_logs?id=eq.${extractionLogId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          extraction_status: success ? 'success' : 'failed',
          error_message: errorMessage || null,
          extracted_data: JSON.stringify({ stepsExecuted: stepResults.length, results: stepResults })
        })
      });
    } catch (e) {
      console.error('Failed to finalize extraction log:', e);
    }
  }

  if (executionLogId) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/workflow_v2_execution_logs?id=eq.${executionLogId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          status: success ? 'completed' : 'failed',
          error_message: errorMessage || null,
          completed_at: now,
          updated_at: now,
          context_data: contextData || null
        })
      });
    } catch (e) {
      console.error('Failed to finalize execution log:', e);
    }
  }
}

export async function logStepExecution(
  supabaseUrl: string,
  supabaseServiceKey: string,
  executionLogId: string | null,
  buttonId: string,
  nodeId: string,
  nodeLabel: string,
  stepType: string,
  status: 'completed' | 'failed' | 'skipped',
  startedAt: string,
  errorMessage: string | null,
  inputData: any,
  outputData: any
): Promise<void> {
  if (!executionLogId) return;
  const now = new Date().toISOString();
  const durationMs = new Date(now).getTime() - new Date(startedAt).getTime();

  try {
    await fetch(`${supabaseUrl}/rest/v1/workflow_v2_step_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({
        execution_log_id: executionLogId,
        workflow_id: null,
        node_id: null,
        node_label: nodeLabel,
        step_type: stepType,
        status,
        started_at: startedAt,
        completed_at: now,
        duration_ms: durationMs,
        error_message: errorMessage || null,
        input_data: inputData || null,
        output_data: outputData || null
      })
    });
  } catch (e) {
    console.error('Failed to log step execution:', e);
  }
}
