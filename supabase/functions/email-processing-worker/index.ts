import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { Buffer } from 'node:buffer';
import { runExtraction } from './extraction.ts';
import { sendQueueFailureNotification, type QueueFailureContext } from './notifications.ts';
import { assignPagesToGroups, type PageGroupConfig } from './pageGroups.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  maxAttempts = 3,
  initialDelayMs = 3000
): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(url, options);
    if (resp.ok || attempt === maxAttempts) return resp;

    const status = resp.status;
    if (status !== 503 && status !== 429 && status !== 500) return resp;

    const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt - 1), 10000);
    console.warn(`${label}: attempt ${attempt}/${maxAttempts} got ${status}, retrying in ${delayMs}ms`);
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`${label}: unreachable`);
}

interface QueueRow {
  id: string;
  source_message_id: string | null;
  provider: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_received_date: string | null;
  matching_rule_id: string | null;
  processing_mode: 'extraction' | 'workflow_v2' | 'transformation';
  extraction_type_id: string | null;
  transformation_type_id: string | null;
  workflow_v2_id: string | null;
  original_filename: string | null;
  storage_path: string;
  page_count: number | null;
  status: string;
  attempts: number;
  page_group_assignments: any[] | null;
  page_group_next_index: number;
  page_group_session_id: string | null;
  page_group_results: any[] | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (req.method === 'POST') {
    let body: any = null;
    try {
      const clone = req.clone();
      body = await clone.json();
    } catch {
      body = null;
    }
    if (body && body.action === 'test-failure-notification') {
      try {
        const ctx: QueueFailureContext = {
          queueId: 'test-' + crypto.randomUUID().slice(0, 8),
          processingMode: 'extraction',
          originalFilename: 'test-attachment.pdf',
          emailSubject: 'Test failure notification',
          emailFrom: 'sender@example.com',
          emailReceivedDate: new Date().toISOString(),
          matchingRuleName: 'Test rule',
          extractionTypeId: null,
          extractionTypeName: 'Test extraction type',
          transformationTypeId: null,
          transformationTypeName: null,
          workflowV2Id: null,
          workflowV2Name: null,
          errorMessage: 'This is a TEST failure notification. No real processing failed.',
          storagePath: null,
          isTest: true,
        };
        const result = await sendQueueFailureNotification(supabase, ctx);
        return new Response(
          JSON.stringify({ success: result.sent, sent: result.sent, skipped: result.skipped, error: result.error }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: (err as Error).message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  try {
    const { data: resetCount } = await supabase.rpc('reset_stale_email_processing_queue_items', { stale_minutes: 15 });
    if (resetCount && resetCount > 0) {
      console.log(`[WORKER] Reset ${resetCount} stale processing row(s) back to pending`);
    }

    const { data: claimed, error: claimError } = await supabase.rpc('claim_next_email_processing_queue_item');
    if (claimError) {
      throw new Error(`Claim RPC failed: ${claimError.message}`);
    }

    const row: QueueRow | null = Array.isArray(claimed) && claimed.length > 0 ? claimed[0] as QueueRow : null;
    if (!row) {
      console.log('[WORKER] No pending queue rows, exiting');
      return new Response(JSON.stringify({ success: true, message: 'Queue empty' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[WORKER] Claimed row ${row.id} mode=${row.processing_mode} attempt=${row.attempts}`);

    let success = false;
    let errorMessage: string | null = null;
    let result: any = null;

    try {
      const pdfBase64 = await downloadPdfAsBase64(supabase, row.storage_path);

      if (row.processing_mode === 'workflow_v2') {
        result = await runWorkflowV2(row, pdfBase64);
      } else if (row.processing_mode === 'transformation') {
        result = await runTransformation(supabase, row, pdfBase64);
      } else if (row.processing_mode === 'extraction') {
        result = await runExtraction(supabase, row, pdfBase64);
      } else {
        throw new Error(`Unknown processing_mode: ${row.processing_mode}`);
      }

      success = !!(result && result.success);
      if (result && result.page_group_partial) {
        console.log(`[WORKER] Row ${row.id} page group partial complete (index ${result.completedIndex}/${result.totalAssignments}), re-queuing`);
        const { error: requeueErr } = await supabase
          .from('email_processing_queue')
          .update({
            status: 'pending',
            worker_locked_at: null,
            page_group_next_index: result.completedIndex + 1,
            page_group_results: result.accumulatedResults,
          })
          .eq('id', row.id);
        if (requeueErr) {
          console.error(`[WORKER] Failed to re-queue row ${row.id}:`, requeueErr.message);
        }
        EdgeRuntime.waitUntil(
          fetch(`${SUPABASE_URL}/functions/v1/email-processing-worker`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          }).catch((err) => console.error('Self-nudge after partial failed:', err))
        );
        return new Response(JSON.stringify({
          success: true,
          processed_id: row.id,
          status: 'partial',
          completedIndex: result.completedIndex,
          totalAssignments: result.totalAssignments,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!success) {
        errorMessage = (result && (result.error || result.details)) || 'Processing failed with no error message';
      }
    } catch (procErr) {
      errorMessage = (procErr as Error).message || 'Unknown worker error';
      console.error(`[WORKER] Row ${row.id} threw:`, errorMessage);
    }

    const updatePayload: Record<string, any> = {
      status: success ? 'processed' : 'failed',
      processed_at: new Date().toISOString(),
      error_message: success ? null : errorMessage,
      result: result || null,
      page_group_assignments: null,
      page_group_next_index: 0,
      page_group_session_id: null,
      page_group_results: null,
    };
    const { error: updateError } = await supabase
      .from('email_processing_queue')
      .update(updatePayload)
      .eq('id', row.id);
    if (updateError) {
      console.error(`[WORKER] Failed to update row ${row.id}:`, updateError.message);
    }

    console.log(`[WORKER] Row ${row.id} -> ${success ? 'processed' : 'failed'}`);

    if (!success) {
      try {
        const { data: freshRow } = await supabase
          .from('email_processing_queue')
          .select('failure_notified_at')
          .eq('id', row.id)
          .maybeSingle();
        if (!freshRow?.failure_notified_at) {
          const ctx = await buildFailureContext(supabase, row, errorMessage || 'Unknown failure');
          const notifyResult = await sendQueueFailureNotification(supabase, ctx);
          if (notifyResult.sent) {
            await supabase
              .from('email_processing_queue')
              .update({ failure_notified_at: new Date().toISOString() })
              .eq('id', row.id);
            console.log(`[WORKER] Failure notification sent for row ${row.id}`);
          } else if (notifyResult.skipped) {
            console.log(`[WORKER] Failure notification skipped for row ${row.id}: ${notifyResult.skipped}`);
          } else if (notifyResult.error) {
            console.warn(`[WORKER] Failure notification error for row ${row.id}: ${notifyResult.error}`);
          }
        }
      } catch (notifyErr) {
        console.warn(`[WORKER] Failure-notification pass threw for row ${row.id}:`, (notifyErr as Error).message);
      }
    }

    const { count } = await supabase
      .from('email_processing_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (count && count > 0) {
      console.log(`[WORKER] ${count} more pending row(s), nudging self`);
      EdgeRuntime.waitUntil(
        fetch(`${SUPABASE_URL}/functions/v1/email-processing-worker`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }).catch((err) => console.error('Self-nudge failed:', err))
      );
    }

    return new Response(JSON.stringify({
      success: true,
      processed_id: row.id,
      status: success ? 'processed' : 'failed',
      error: errorMessage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[WORKER] Fatal:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function buildFailureContext(
  supabase: any,
  row: QueueRow,
  errorMessage: string
): Promise<QueueFailureContext> {
  let matchingRuleName: string | null = null;
  let extractionTypeName: string | null = null;
  let transformationTypeName: string | null = null;
  let workflowV2Name: string | null = null;

  if (row.matching_rule_id) {
    const { data } = await supabase
      .from('email_processing_rules')
      .select('rule_name')
      .eq('id', row.matching_rule_id)
      .maybeSingle();
    matchingRuleName = data?.rule_name || null;
  }
  if (row.extraction_type_id) {
    const { data } = await supabase
      .from('extraction_types')
      .select('name')
      .eq('id', row.extraction_type_id)
      .maybeSingle();
    extractionTypeName = data?.name || null;
  }
  if (row.transformation_type_id) {
    const { data } = await supabase
      .from('transformation_types')
      .select('name')
      .eq('id', row.transformation_type_id)
      .maybeSingle();
    transformationTypeName = data?.name || null;
  }
  if (row.workflow_v2_id) {
    const { data } = await supabase
      .from('workflows_v2')
      .select('name')
      .eq('id', row.workflow_v2_id)
      .maybeSingle();
    workflowV2Name = data?.name || null;
  }

  return {
    queueId: row.id,
    processingMode: row.processing_mode,
    originalFilename: row.original_filename,
    emailSubject: row.email_subject,
    emailFrom: row.email_from,
    emailReceivedDate: row.email_received_date,
    matchingRuleName,
    extractionTypeId: row.extraction_type_id,
    extractionTypeName,
    transformationTypeId: row.transformation_type_id,
    transformationTypeName,
    workflowV2Id: row.workflow_v2_id,
    workflowV2Name,
    errorMessage,
    storagePath: row.storage_path,
  };
}

async function downloadPdfAsBase64(supabase: any, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('email-processing-pdfs').download(path);
  if (error) {
    throw new Error(`Failed to download PDF at ${path}: ${error.message}`);
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
}

async function runWorkflowV2(row: QueueRow, pdfBase64: string): Promise<any> {
  if (!row.workflow_v2_id) {
    throw new Error('workflow_v2 mode row missing workflow_v2_id');
  }

  let workflowType = 'extraction';
  try {
    const wtResp = await fetch(
      `${SUPABASE_URL}/rest/v1/workflows_v2?id=eq.${row.workflow_v2_id}&select=workflow_type`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    if (wtResp.ok) {
      const wtData = await wtResp.json();
      if (Array.isArray(wtData) && wtData.length > 0 && wtData[0].workflow_type) {
        workflowType = wtData[0].workflow_type;
      }
    }
  } catch (e) {
    console.warn('[WORKER] Failed to resolve workflow_type, defaulting to extraction:', (e as Error).message);
  }

  let processorEndpoint = 'json-workflow-processor-v2';
  let processingMode = 'extraction';
  if (workflowType === 'transformation') {
    processorEndpoint = 'transform-workflow-processor-v2';
    processingMode = 'transformation';
  } else if (workflowType === 'imaging') {
    processingMode = 'imaging';
  }

  const filename = row.original_filename || 'attachment.pdf';
  const payload = {
    workflowId: row.workflow_v2_id,
    userId: null,
    pdfFilename: filename,
    originalPdfFilename: filename,
    pdfBase64,
    extractedData: {},
    processingMode,
    triggerSource: 'email_processing_queue',
    senderEmail: row.email_from || '',
    contextData: {
      emailSubject: row.email_subject || '',
      emailBody: '',
      emailFrom: row.email_from || '',
      emailDate: row.email_received_date || '',
      pdfBase64,
      pdfFilename: filename,
      originalPdfFilename: filename,
      extractedData: {},
      queueRowId: row.id,
    },
  };

  console.log(`[WORKER] Posting to ${processorEndpoint} for workflow ${row.workflow_v2_id} (mode=${processingMode})`);

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${processorEndpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let processorResult: any;
  try {
    processorResult = await resp.json();
  } catch {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Processor ${processorEndpoint} returned non-JSON (status ${resp.status}): ${txt.slice(0, 500)}`);
  }

  if (processorResult && processorResult.paused === true) {
    return {
      success: true,
      paused_for_review: true,
      processor: processorEndpoint,
      workflow_type: workflowType,
      processorResult,
    };
  }

  return {
    success: !!processorResult.success,
    error: processorResult.error || processorResult.details || null,
    processor: processorEndpoint,
    workflow_type: workflowType,
    extractionLogId: processorResult.extractionLogId || null,
    processorResult,
  };
}

async function runTransformation(supabase: any, row: QueueRow, pdfBase64: string): Promise<any> {
  if (!row.transformation_type_id) {
    throw new Error('transformation mode row missing transformation_type_id');
  }

  const { data: transformationType, error: ttErr } = await supabase
    .from('transformation_types')
    .select('*')
    .eq('id', row.transformation_type_id)
    .maybeSingle();

  if (ttErr) throw new Error(`Failed to load transformation_type: ${ttErr.message}`);
  if (!transformationType) throw new Error(`Transformation type ${row.transformation_type_id} not found`);

  const filename = row.original_filename || 'attachment.pdf';

  const { data: pageGroupConfigs, error: pgcErr } = await supabase
    .from('page_group_configs')
    .select('*')
    .eq('transformation_type_id', transformationType.id)
    .order('group_order', { ascending: true });

  if (pgcErr) {
    console.warn('[WORKER] page_group_configs load warning:', pgcErr.message);
  }

  const groupConfigs: PageGroupConfig[] = pageGroupConfigs || [];
  console.log(`[WORKER] transformation_type=${transformationType.name} page_group_configs found=${groupConfigs.length}`);

  if (groupConfigs.length > 0) {
    return await runTransformationWithPageGroups(supabase, row, pdfBase64, transformationType, groupConfigs, filename);
  }

  let fieldMappings: any[] = [];
  if (transformationType.field_mappings) {
    try {
      fieldMappings = typeof transformationType.field_mappings === 'string'
        ? JSON.parse(transformationType.field_mappings)
        : transformationType.field_mappings;
    } catch {
      console.warn('[WORKER] Failed to parse transformation field_mappings');
    }
  }

  const pagesPerGroup = transformationType.pages_per_group || 1;
  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  console.log(`[WORKER] PDF has ${totalPages} pages, pages_per_group=${pagesPerGroup}`);

  const pageChunks: { base64: string; pageLabel: string; pageCount: number }[] = [];

  if (pagesPerGroup === 1 && totalPages > 1) {
    console.log(`[WORKER] Splitting ${totalPages}-page PDF into individual pages for per-page processing`);
    for (let i = 0; i < totalPages; i++) {
      const singleDoc = await PDFDocument.create();
      const [copied] = await singleDoc.copyPages(pdfDoc, [i]);
      singleDoc.addPage(copied);
      const bytes = await singleDoc.save();
      pageChunks.push({
        base64: Buffer.from(bytes).toString('base64'),
        pageLabel: `page ${i + 1}/${totalPages}`,
        pageCount: 1,
      });
    }
  } else if (pagesPerGroup > 1 && totalPages > pagesPerGroup) {
    console.log(`[WORKER] Splitting ${totalPages}-page PDF into chunks of ${pagesPerGroup}`);
    for (let start = 0; start < totalPages; start += pagesPerGroup) {
      const end = Math.min(start + pagesPerGroup, totalPages);
      const chunkDoc = await PDFDocument.create();
      const indices = Array.from({ length: end - start }, (_, k) => start + k);
      const copied = await chunkDoc.copyPages(pdfDoc, indices);
      copied.forEach(p => chunkDoc.addPage(p));
      const bytes = await chunkDoc.save();
      pageChunks.push({
        base64: Buffer.from(bytes).toString('base64'),
        pageLabel: `pages ${start + 1}-${end}/${totalPages}`,
        pageCount: end - start,
      });
    }
  } else {
    pageChunks.push({ base64: pdfBase64, pageLabel: 'all', pageCount: totalPages });
  }

  console.log(`[WORKER] Processing ${pageChunks.length} chunk(s)`);

  let overallSuccess = true;
  let firstError: string | null = null;
  let lastNewFilename = filename;
  let lastExtractionLogId: string | null = null;
  let anyPaused = false;
  const chunkResults: Array<{ chunk: string; success: boolean; error?: string }> = [];

  for (let chunkIdx = 0; chunkIdx < pageChunks.length; chunkIdx++) {
    const chunk = pageChunks[chunkIdx];
    console.log(`[WORKER] --- Chunk ${chunkIdx + 1}/${pageChunks.length} (${chunk.pageLabel}) ---`);

    const { data: extLog, error: extLogErr } = await supabase
      .from('extraction_logs')
      .insert({
        extraction_type_id: null,
        transformation_type_id: transformationType.id,
        processing_mode: 'transformation',
        pdf_filename: filename,
        extraction_status: 'processing',
      })
      .select('id')
      .maybeSingle();
    const extractionLogId = extLog?.id || null;
    lastExtractionLogId = extractionLogId;
    if (extLogErr) console.warn('[WORKER] extraction_logs insert warning:', extLogErr.message);

    const transformerResp = await fetch(`${SUPABASE_URL}/functions/v1/pdf-transformer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfBase64: chunk.base64,
        transformationType: {
          id: transformationType.id,
          name: transformationType.name,
          defaultInstructions: transformationType.default_instructions,
          filenameTemplate: transformationType.filename_template,
          fieldMappings,
        },
      }),
    });

    if (!transformerResp.ok) {
      const errText = await transformerResp.text().catch(() => '');
      const msg = `pdf-transformer failed for ${chunk.pageLabel}: ${transformerResp.status} - ${errText.slice(0, 500)}`;
      console.error('[WORKER]', msg);
      if (extractionLogId) {
        await supabase.from('extraction_logs').update({ extraction_status: 'failed', error_message: msg }).eq('id', extractionLogId);
      }
      overallSuccess = false;
      if (!firstError) firstError = msg;
      chunkResults.push({ chunk: chunk.pageLabel, success: false, error: msg });
      continue;
    }

    const transformerResult = await transformerResp.json();
    const extractedRenameData = transformerResult.extractedData || {};
    const newFilename = transformerResult.newFilename || filename;
    lastNewFilename = newFilename;
    console.log(`[WORKER] Chunk ${chunkIdx + 1} renamed to: ${newFilename}`);

    const workflowVersion = transformationType.workflow_version || 'v1';
    const workflowId = workflowVersion === 'v2' ? transformationType.workflow_v2_id : transformationType.workflow_id;

    if (!workflowId) {
      if (extractionLogId) {
        await supabase.from('extraction_logs').update({
          extracted_data: JSON.stringify(extractedRenameData),
          extraction_status: 'success',
        }).eq('id', extractionLogId);
      }
      console.log(`[WORKER] Chunk ${chunkIdx + 1} complete (no workflow assigned)`);
      chunkResults.push({ chunk: chunk.pageLabel, success: true });
      continue;
    }

    const processorEndpoint = workflowVersion === 'v2'
      ? 'transform-workflow-processor-v2'
      : 'transform-workflow-processor';

    const payload: Record<string, any> = {
      workflowId,
      userId: null,
      transformationTypeId: transformationType.id,
      extractionLogId,
      pdfFilename: newFilename,
      originalPdfFilename: filename,
      pdfBase64: chunk.base64,
      pdfPages: chunk.pageCount,
      extractedData: extractedRenameData,
      extractionTypeFilename: transformationType.filename_template,
      senderEmail: row.email_from || '',
      triggerSource: 'email_processing_queue',
      formatType: 'JSON',
    };

    if (workflowVersion === 'v2') {
      payload.processingMode = 'transformation';
      payload.contextData = {
        emailSubject: row.email_subject || '',
        emailFrom: row.email_from || '',
        senderEmail: row.email_from || '',
        queueRowId: row.id,
      };
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${processorEndpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let processorResult: any;
    try {
      processorResult = await resp.json();
    } catch {
      const msg = `Processor ${processorEndpoint} returned non-JSON (status ${resp.status}) for ${chunk.pageLabel}`;
      console.error('[WORKER]', msg);
      if (extractionLogId) {
        await supabase.from('extraction_logs').update({ extraction_status: 'failed', error_message: msg }).eq('id', extractionLogId);
      }
      overallSuccess = false;
      if (!firstError) firstError = msg;
      chunkResults.push({ chunk: chunk.pageLabel, success: false, error: msg });
      continue;
    }

    if (extractionLogId) {
      await supabase.from('extraction_logs').update({
        extracted_data: JSON.stringify(extractedRenameData),
        extraction_status: processorResult.success ? 'success' : 'failed',
        error_message: processorResult.error || null,
      }).eq('id', extractionLogId);
    }

    if (processorResult?.paused === true) anyPaused = true;

    const chunkSuccess = !!processorResult.success || processorResult?.paused === true;
    console.log(`[WORKER] Chunk ${chunkIdx + 1} (${chunk.pageLabel}) result: success=${chunkSuccess} error=${processorResult.error || 'none'}`);
    chunkResults.push({ chunk: chunk.pageLabel, success: chunkSuccess, error: chunkSuccess ? undefined : (processorResult.error || processorResult.details) });
    if (!chunkSuccess) {
      overallSuccess = false;
      if (!firstError) firstError = processorResult.error || processorResult.details || 'workflow failed';
    }
  }

  console.log(`[WORKER] === TRANSFORMATION COMPLETE: ${chunkResults.filter(r => r.success).length}/${chunkResults.length} chunks succeeded ===`);

  return {
    success: overallSuccess,
    error: overallSuccess ? null : firstError,
    paused_for_review: anyPaused || undefined,
    processor: (transformationType.workflow_version || 'v1') === 'v2' ? 'transform-workflow-processor-v2' : 'transform-workflow-processor',
    newFilename: lastNewFilename,
    extractionLogId: lastExtractionLogId,
    chunkResults,
  };
}

async function runTransformationWithPageGroups(
  supabase: any,
  row: QueueRow,
  pdfBase64: string,
  transformationType: any,
  groupConfigs: PageGroupConfig[],
  filename: string
): Promise<any> {
  const sortedConfigs = [...groupConfigs].sort((a, b) => a.group_order - b.group_order);

  let savedAssignments: any[] | null = row.page_group_assignments;
  let sessionId = row.page_group_session_id || `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let nextIndex = row.page_group_next_index || 0;
  const accumulatedResults: any[] = row.page_group_results || [];

  if (!savedAssignments) {
    console.log(`[WORKER] === PAGE GROUP DETECTION START (session=${sessionId}, groups=${groupConfigs.length}) ===`);
    const { assignments, totalPages } = await assignPagesToGroups(pdfBase64, sortedConfigs, supabase);
    console.log(`[WORKER] Assigned ${assignments.length} of ${totalPages} pages across groups`);

    if (assignments.length === 0) {
      return { success: false, error: 'No pages matched any page group during detection', session: sessionId };
    }

    savedAssignments = assignments.map(a => ({
      pageIndex: a.pageIndex,
      groupOrder: a.groupConfig.group_order,
      groupConfigId: a.groupConfig.id,
    }));

    await supabase.from('email_processing_queue').update({
      page_group_assignments: savedAssignments,
      page_group_session_id: sessionId,
      page_group_next_index: 0,
      page_group_results: [],
    }).eq('id', row.id);

    nextIndex = 0;
    console.log(`[WORKER] Saved ${savedAssignments.length} assignments to queue row, starting at index 0`);
  } else {
    console.log(`[WORKER] === PAGE GROUP RESUME (session=${sessionId}, index=${nextIndex}/${savedAssignments.length}) ===`);
  }

  if (nextIndex >= savedAssignments.length) {
    const overallSuccess = accumulatedResults.every(r => r.success);
    const firstError = accumulatedResults.find(r => !r.success)?.error || null;
    const anyPaused = accumulatedResults.some(r => r.paused);
    console.log(`[WORKER] === PAGE GROUP COMPLETE (session=${sessionId}) overallSuccess=${overallSuccess} ===`);
    return {
      success: overallSuccess,
      error: overallSuccess ? null : firstError,
      paused_for_review: anyPaused,
      session: sessionId,
      pageGroupResults: accumulatedResults,
    };
  }

  const current = savedAssignments[nextIndex];
  const groupConfig = sortedConfigs.find(c => c.id === current.groupConfigId)
    || sortedConfigs.find(c => c.group_order === current.groupOrder)
    || sortedConfigs[0];
  const pageIndex = current.pageIndex;

  console.log(`[WORKER] Processing assignment ${nextIndex + 1}/${savedAssignments.length}: page ${pageIndex + 1} -> group ${groupConfig.group_order} (${groupConfig.name || 'unnamed'})`);

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const singleDoc = await PDFDocument.create();
  const [copiedPage] = await singleDoc.copyPages(pdfDoc, [pageIndex]);
  singleDoc.addPage(copiedPage);
  const pageBytes = await singleDoc.save();
  const pageBase64 = Buffer.from(pageBytes).toString('base64');

  const groupWorkflowVersion = groupConfig.workflow_version || transformationType.workflow_version || 'v1';
  const groupWorkflowId = groupWorkflowVersion === 'v2'
    ? (groupConfig.workflow_v2_id || transformationType.workflow_v2_id)
    : (groupConfig.workflow_id || transformationType.workflow_id);

  const { data: extLog, error: extLogErr } = await supabase
    .from('extraction_logs')
    .insert({
      extraction_type_id: null,
      transformation_type_id: transformationType.id,
      processing_mode: 'transformation',
      pdf_filename: filename,
      extraction_status: 'processing',
    })
    .select('id')
    .maybeSingle();
  if (extLogErr) console.warn('[WORKER] group extraction_logs insert warning:', extLogErr.message);
  const extractionLogId = extLog?.id || null;

  let fieldMappings: any[] = [];
  const rawMappings = groupConfig.field_mappings ?? transformationType.field_mappings;
  if (rawMappings) {
    try {
      fieldMappings = typeof rawMappings === 'string' ? JSON.parse(rawMappings) : rawMappings;
    } catch {
      console.warn(`[WORKER] Failed to parse field_mappings for group ${groupConfig.group_order}`);
    }
  }
  const filenameTemplate = groupConfig.filename_template || transformationType.filename_template;

  const transformerResp = await fetchWithRetry(
    `${SUPABASE_URL}/functions/v1/pdf-transformer`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfBase64: pageBase64,
        transformationType: {
          id: transformationType.id,
          name: transformationType.name,
          defaultInstructions: transformationType.default_instructions,
          filenameTemplate,
          fieldMappings,
        },
        sessionId,
        groupOrder: groupConfig.group_order,
        pageIndex,
      }),
    },
    `pdf-transformer group ${groupConfig.group_order} page ${pageIndex + 1}`
  );

  if (!transformerResp.ok) {
    const errText = await transformerResp.text().catch(() => '');
    const msg = `pdf-transformer failed for group ${groupConfig.group_order} page ${pageIndex + 1}: ${transformerResp.status} - ${errText.slice(0, 500)}`;
    console.error('[WORKER]', msg);
    if (extractionLogId) {
      await supabase.from('extraction_logs').update({ extraction_status: 'failed', error_message: msg }).eq('id', extractionLogId);
    }
    accumulatedResults.push({ pageIndex, groupOrder: groupConfig.group_order, success: false, error: msg });
    return {
      page_group_partial: true,
      completedIndex: nextIndex,
      totalAssignments: savedAssignments.length,
      accumulatedResults,
    };
  }

  const transformerResult = await transformerResp.json();
  const extractedRenameData = transformerResult.extractedData || {};
  const newFilename = transformerResult.newFilename || filename;
  console.log(`[WORKER] Group ${groupConfig.group_order} page ${pageIndex + 1} new_filename=${newFilename}`);

  if (!groupWorkflowId) {
    if (extractionLogId) {
      await supabase.from('extraction_logs').update({
        extracted_data: JSON.stringify(extractedRenameData),
        extraction_status: 'success',
      }).eq('id', extractionLogId);
    }
    accumulatedResults.push({ pageIndex, groupOrder: groupConfig.group_order, success: true });
    if (nextIndex + 1 >= savedAssignments.length) {
      return {
        success: accumulatedResults.every(r => r.success),
        error: accumulatedResults.find(r => !r.success)?.error || null,
        session: sessionId,
        pageGroupResults: accumulatedResults,
      };
    }
    return {
      page_group_partial: true,
      completedIndex: nextIndex,
      totalAssignments: savedAssignments.length,
      accumulatedResults,
    };
  }

  const processorEndpoint = groupWorkflowVersion === 'v2'
    ? 'transform-workflow-processor-v2'
    : 'transform-workflow-processor';

  const payload: Record<string, any> = {
    workflowId: groupWorkflowId,
    userId: null,
    transformationTypeId: transformationType.id,
    extractionLogId,
    pdfFilename: newFilename,
    originalPdfFilename: filename,
    pdfBase64: pageBase64,
    pdfPages: 1,
    extractedData: extractedRenameData,
    extractionTypeFilename: transformationType.filename_template,
    pageGroupFilenameTemplate: groupConfig.filename_template,
    senderEmail: row.email_from || '',
    triggerSource: 'email_processing_queue',
    formatType: 'JSON',
    sessionId,
    groupOrder: groupConfig.group_order,
    pageIndex,
  };
  if (groupWorkflowVersion === 'v2') {
    payload.processingMode = 'transformation';
    payload.contextData = {
      emailSubject: row.email_subject || '',
      emailFrom: row.email_from || '',
      senderEmail: row.email_from || '',
      queueRowId: row.id,
    };
  }

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${processorEndpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let processorResult: any;
  try {
    processorResult = await resp.json();
  } catch {
    const msg = `Processor ${processorEndpoint} returned non-JSON (status ${resp.status}) for group ${groupConfig.group_order} page ${pageIndex + 1}`;
    console.error('[WORKER]', msg);
    if (extractionLogId) {
      await supabase.from('extraction_logs').update({ extraction_status: 'failed', error_message: msg }).eq('id', extractionLogId);
    }
    accumulatedResults.push({ pageIndex, groupOrder: groupConfig.group_order, success: false, error: msg });
    return {
      page_group_partial: true,
      completedIndex: nextIndex,
      totalAssignments: savedAssignments.length,
      accumulatedResults,
    };
  }

  if (extractionLogId) {
    await supabase.from('extraction_logs').update({
      extracted_data: JSON.stringify(extractedRenameData),
      extraction_status: processorResult.success ? 'success' : 'failed',
      error_message: processorResult.error || null,
    }).eq('id', extractionLogId);
  }

  const pageSuccess = !!processorResult.success || processorResult?.paused === true;
  console.log(`[WORKER] Group ${groupConfig.group_order} page ${pageIndex + 1} result success=${pageSuccess} error=${processorResult.error || 'none'}`);
  accumulatedResults.push({
    pageIndex,
    groupOrder: groupConfig.group_order,
    success: pageSuccess,
    paused: processorResult?.paused === true,
    error: pageSuccess ? undefined : (processorResult.error || processorResult.details || 'workflow failed'),
  });

  const isLastAssignment = nextIndex + 1 >= savedAssignments.length;
  if (isLastAssignment) {
    const overallSuccess = accumulatedResults.every(r => r.success);
    const firstError = accumulatedResults.find(r => !r.success)?.error || null;
    const anyPaused = accumulatedResults.some(r => r.paused);
    console.log(`[WORKER] === PAGE GROUP COMPLETE (session=${sessionId}) overallSuccess=${overallSuccess} paused=${anyPaused} ===`);
    return {
      success: overallSuccess,
      error: overallSuccess ? null : firstError,
      paused_for_review: anyPaused,
      newFilename,
      extractionLogId,
      session: sessionId,
      pageGroupResults: accumulatedResults,
    };
  }

  return {
    page_group_partial: true,
    completedIndex: nextIndex,
    totalAssignments: savedAssignments.length,
    accumulatedResults,
  };
}
