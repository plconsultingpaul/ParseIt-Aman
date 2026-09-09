import { corsHeaders, createSupabaseClient } from './config.ts';
import { EmailProvider, findMatchingRule, getPostProcessAction } from './lib/services/email-base.ts';
import { GmailProvider } from './lib/services/gmail.ts';
import { Office365Provider } from './lib/services/office365.ts';
import { LoggingService } from './lib/services/logging.ts';
import { handleWorkflowV2Mode } from './lib/handlers/workflow-v2.ts';
import type {
  ProcessedEmailResult,
  ProcessingRule,
  PdfAttachment,
} from './types.ts';

interface CaptureResult {
  emailResult: ProcessedEmailResult;
  attachments: PdfAttachment[];
  matchingRule: ProcessingRule | null;
  parseitId: number | null;
  queueRowIds: string[];
  postProcessed?: boolean;
}

Deno.serve(async (req) => {
  const invocationStart = Date.now();
  console.log(`[TIMING] Email monitor invocation START at ${new Date(invocationStart).toISOString()}`);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();
  const logger = new LoggingService(supabase);

  let emailsCheckedCount = 0;
  let emailsProcessedCount = 0;
  let emailsSkippedCount = 0;
  let emailsFailedCount = 0;

  try {
    await supabase
      .from('email_processing_locks')
      .delete()
      .lt('locked_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    const STALE_THRESHOLD_MS = 10 * 60 * 1000;
    const { data: runningLog } = await supabase
      .from('email_polling_logs')
      .select('id, created_at')
      .eq('status', 'running')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runningLog) {
      const runningAge = Date.now() - new Date(runningLog.created_at).getTime();
      if (runningAge > STALE_THRESHOLD_MS) {
        console.log('Found stale running log older than threshold, marking as failed:', runningLog.id);
        await supabase
          .from('email_polling_logs')
          .update({ status: 'failed', error_message: 'Stale: exceeded timeout' })
          .eq('id', runningLog.id);
      } else {
        console.log('Previous email monitor run still in progress, skipping this invocation. Running log ID:', runningLog.id);
        return new Response(JSON.stringify({
          success: true,
          message: 'Previous run still in progress, skipping',
          emailsChecked: 0,
          emailsProcessed: 0,
          results: []
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    console.log('Creating initial polling log entry');
    await logger.createPollingLog('office365');

    const { data: config, error: configError } = await supabase
      .from('email_monitoring_config')
      .select('*')
      .single();

    if (configError) {
      console.error('Failed to fetch email monitoring config:', configError);
      await logger.markPollingFailed(`Failed to fetch config: ${configError.message}`);
      throw configError;
    }

    console.log('Email monitoring config loaded, provider:', config.provider);
    await logger.updatePollingLog({ provider: config.provider });

    if (!config.is_enabled) {
      console.log('Email monitoring is disabled');
      await logger.markPollingSuccess(0, 0, 0, 0);
      return new Response(JSON.stringify({
        success: true,
        message: 'Email monitoring is disabled',
        emailsChecked: 0,
        emailsProcessed: 0,
        results: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Fetching email processing rules');

    const { data: rules, error: rulesError } = await supabase
      .from('email_processing_rules')
      .select(`
        id,
        rule_name,
        sender_pattern,
        subject_pattern,
        extraction_type_id,
        transformation_type_id,
        is_enabled,
        priority,
        processing_mode,
        workflow_v2_id
      `)
      .eq('is_enabled', true)
      .order('priority', { ascending: false });

    if (rulesError) {
      console.error('Failed to fetch processing rules:', rulesError);
      await logger.markPollingFailed(`Failed to fetch rules: ${rulesError.message}`);
      throw rulesError;
    }

    console.log('Found', rules?.length || 0, 'active processing rules');

    const provider: EmailProvider = config.provider === 'gmail'
      ? new GmailProvider(config)
      : new Office365Provider(config);

    console.log(`Processing ${provider.providerName} emails`);

    await provider.authenticate();

    const allEmails = await provider.fetchUnreadEmails();
    console.log('Found', allEmails.length, `${provider.providerName} unread emails`);

    if (allEmails.length === 0) {
      console.log('No unread emails to process');
      await supabase
        .from('email_monitoring_config')
        .update({ last_check: new Date().toISOString() })
        .eq('id', config.id);
      await logger.markPollingSuccess(0, 0, 0, 0);
      return new Response(JSON.stringify({
        success: true,
        message: 'No emails to process.',
        emailsChecked: 0,
        emailsProcessed: 0,
        results: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let email = null;
    let lockedEmailId: string | null = null;
    for (const candidate of allEmails) {
      const { error: lockError } = await supabase
        .from('email_processing_locks')
        .insert({ email_id: candidate.id, polling_log_id: logger.getPollingLogId() });
      if (!lockError) {
        email = candidate;
        lockedEmailId = candidate.id;
        console.log(`[LOCK] Acquired email_processing_lock for emailId=${candidate.id}`);
        break;
      }
      console.log(`[LOCK] Email ${candidate.id} already locked by another invocation, trying next. err=${lockError.code}`);
    }

    if (!email) {
      console.log('All unread emails are locked by other invocations, nothing to do this run');
      await supabase
        .from('email_monitoring_config')
        .update({ last_check: new Date().toISOString() })
        .eq('id', config.id);
      await logger.markPollingSuccess(0, 0, 0, 0);
      return new Response(JSON.stringify({
        success: true,
        message: 'All unread emails already being processed by another invocation',
        emailsChecked: 0,
        emailsProcessed: 0,
        results: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Capturing 1 of', allEmails.length, 'emails');

    let result: CaptureResult;
    try {
      result = await captureEmail(
        email.id,
        provider,
        rules || [],
        supabase,
        config
      );
    } finally {
      if (lockedEmailId) {
        await supabase
          .from('email_processing_locks')
          .delete()
          .eq('email_id', lockedEmailId);
        console.log(`[LOCK] Released email_processing_lock for emailId=${lockedEmailId}`);
      }
    }

    await logger.logProcessedEmail(
      result.emailResult,
      result.attachments,
      result.matchingRule,
      result.parseitId
    );

    emailsCheckedCount = 1;
    console.log('[CLASSIFY] Email result:', JSON.stringify({
      from: result.emailResult.from,
      subject: result.emailResult.subject,
      processedSuccessfully: result.emailResult.processedSuccessfully,
      rule: result.emailResult.rule,
      errorMessage: result.emailResult.errorMessage,
      queueRows: result.queueRowIds.length
    }));
    if (result.emailResult.processedSuccessfully) {
      emailsProcessedCount = 1;
      console.log('[CLASSIFY] -> CAPTURED (queued for processing)');
    } else if (result.emailResult.rule === 'No rule matched') {
      emailsSkippedCount = 1;
      console.log('[CLASSIFY] -> SKIPPED (no rule matched)');
    } else {
      emailsFailedCount = 1;
      console.log('[CLASSIFY] -> FAILED (rule:', result.emailResult.rule, ')');
    }

    const unmatchedSummary = result.emailResult.rule === 'No rule matched'
      ? `Unmatched senders: "${result.emailResult.from}" (subject: "${result.emailResult.subject}")`
      : null;

    if (result.postProcessed) {
      console.log('[V2_DIRECT] Skipping post-process action; handler already applied it');
    } else if (result.emailResult.rule === 'No rule matched') {
      const { action, folderPath } = getPostProcessAction(config, 'no_rule_match');
      console.log(`[NO_RULE_MATCH] Applying post-process action: ${action}, folder: ${folderPath}`);
      if (action !== 'none') {
        await provider.applyPostProcessAction(email.id, action, folderPath);
      }
    } else if (result.emailResult.processedSuccessfully) {
      const { action, folderPath } = getPostProcessAction(config, 'success');
      console.log(`[SUCCESS] Applying post-process action: ${action}, folder: ${folderPath}`);
      if (action !== 'none') {
        await provider.applyPostProcessAction(email.id, action, folderPath);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (result.queueRowIds.length > 0 && supabaseUrl && serviceRoleKey) {
        console.log(`[QUEUE] Nudging worker for ${result.queueRowIds.length} queued PDF(s)`);
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/email-processing-worker`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
          }).catch((err) => console.error('Worker nudge failed:', err))
        );
      }
    } else {
      const { action, folderPath } = getPostProcessAction(config, 'failure');
      console.log(`[FAILURE] Applying post-process action: ${action}, folder: ${folderPath}`);
      if (action !== 'none') {
        await provider.applyPostProcessAction(email.id, action, folderPath);
      }
    }

    console.log('Email capture completed. Checked: 1, Captured:', emailsProcessedCount, 'Skipped:', emailsSkippedCount, 'Failed:', emailsFailedCount);
    if (unmatchedSummary) {
      console.log('[UNMATCHED]', unmatchedSummary);
    }

    await supabase
      .from('email_monitoring_config')
      .update({ last_check: new Date().toISOString() })
      .eq('id', config.id);

    console.log(`[TIMING] About to markPollingSuccess. Total invocation elapsedMs=${Date.now() - invocationStart}`);
    await logger.markPollingSuccess(emailsCheckedCount, emailsProcessedCount, emailsSkippedCount, emailsFailedCount, unmatchedSummary);

    console.log(`[TIMING] Email monitoring completed successfully. Total invocation elapsedMs=${Date.now() - invocationStart}`);

    const remainingCount = allEmails.length - 1;
    if (remainingCount > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      console.log(`${remainingCount} emails remaining, triggering next invocation`);
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/email-monitor`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
        }).catch(err => console.error('Self-invocation failed:', err))
      );
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Email capture completed. Captured ${emailsProcessedCount} email(s).${remainingCount > 0 ? ` ${remainingCount} more queued.` : ''}`,
      emailsChecked: emailsCheckedCount,
      emailsProcessed: emailsProcessedCount,
      results: []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Email monitor function error:', error);

    if (logger.getPollingLogId()) {
      await logger.markPollingFailed((error as Error).message);
    }

    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message,
      emailsChecked: emailsCheckedCount,
      emailsProcessed: emailsProcessedCount,
      results: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function sanitizeFilename(name: string): string {
  const trimmed = (name || 'attachment.pdf').trim();
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
}

function buildStoragePath(queueId: string, filename: string, receivedIso: string): string {
  let d: Date;
  try {
    d = new Date(receivedIso);
    if (isNaN(d.getTime())) d = new Date();
  } catch {
    d = new Date();
  }
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}/${queueId}/${sanitizeFilename(filename)}`;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/^data:.*;base64,/, '').replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function resolveProcessingMode(rule: ProcessingRule): 'extraction' | 'workflow_v2' | 'transformation' {
  if (rule.processing_mode === 'workflow_v2' && rule.workflow_v2_id) return 'workflow_v2';
  if (rule.processing_mode === 'transformation') return 'transformation';
  return 'extraction';
}

async function captureEmail(
  emailId: string,
  provider: EmailProvider,
  rules: ProcessingRule[],
  supabase: any,
  config: any
): Promise<CaptureResult> {
  console.log('Capturing email:', emailId);

  const providerName = config.provider === 'gmail' ? 'gmail' : 'office365';

  let details;
  try {
    details = await provider.getEmailDetails(emailId);
  } catch (err) {
    console.error('Error fetching email details:', err);
    return {
      emailResult: {
        id: emailId, from: '', subject: '', receivedDate: '',
        processedSuccessfully: false,
        errorMessage: (err as Error).message,
        extractionLogId: null,
        rule: 'Error before rule match'
      },
      attachments: [],
      matchingRule: null,
      parseitId: null,
      queueRowIds: []
    };
  }

  const { subject, from: fromEmail, receivedDate } = details;
  console.log('Email details - From:', fromEmail, 'Subject:', subject);

  const matchingRule = findMatchingRule(fromEmail, subject, rules);
  if (!matchingRule) {
    console.log('No matching processing rule found');
    return {
      emailResult: {
        id: emailId, from: fromEmail, subject, receivedDate,
        processedSuccessfully: false,
        errorMessage: 'No matching processing rule found',
        extractionLogId: null,
        rule: 'No rule matched'
      },
      attachments: [],
      matchingRule: null,
      parseitId: null,
      queueRowIds: []
    };
  }

  console.log('Found matching rule:', matchingRule.rule_name, 'mode:', matchingRule.processing_mode || 'extraction');

  if (resolveProcessingMode(matchingRule) === 'workflow_v2') {
    console.log('[V2_DIRECT] Bypassing capture queue; running Workflow V2 handler directly for rule', matchingRule.rule_name);
    try {
      const v2Result = await handleWorkflowV2Mode(
        emailId,
        provider,
        matchingRule,
        fromEmail,
        subject,
        receivedDate,
        supabase,
        new LoggingService(supabase),
        config
      );
      return {
        emailResult: v2Result.emailResult,
        attachments: v2Result.attachments,
        matchingRule: v2Result.matchingRule,
        parseitId: v2Result.parseitId,
        queueRowIds: [],
        postProcessed: true,
      };
    } catch (v2Err) {
      console.error('[V2_DIRECT] Workflow V2 handler threw:', v2Err);
      return {
        emailResult: {
          id: emailId, from: fromEmail, subject, receivedDate,
          processedSuccessfully: false,
          errorMessage: (v2Err as Error).message || 'Workflow V2 handler error',
          extractionLogId: null,
          rule: matchingRule.rule_name
        },
        attachments: [],
        matchingRule,
        parseitId: null,
        queueRowIds: [],
        postProcessed: false,
      };
    }
  }

  let attachments: PdfAttachment[] = [];
  try {
    attachments = await provider.findPdfAttachments(emailId);
  } catch (err) {
    console.error('Error fetching PDF attachments:', err);
    return {
      emailResult: {
        id: emailId, from: fromEmail, subject, receivedDate,
        processedSuccessfully: false,
        errorMessage: `Failed to fetch attachments: ${(err as Error).message}`,
        extractionLogId: null,
        rule: matchingRule.rule_name
      },
      attachments: [],
      matchingRule,
      parseitId: null,
      queueRowIds: []
    };
  }

  if (attachments.length === 0) {
    console.log('No PDF attachments found on matched email');
    return {
      emailResult: {
        id: emailId, from: fromEmail, subject, receivedDate,
        processedSuccessfully: false,
        errorMessage: 'No PDF attachments found',
        extractionLogId: null,
        rule: matchingRule.rule_name
      },
      attachments: [],
      matchingRule,
      parseitId: null,
      queueRowIds: []
    };
  }

  const processingMode = resolveProcessingMode(matchingRule);
  const uploadedPaths: string[] = [];
  const insertedIds: string[] = [];

  try {
    for (const att of attachments) {
      const bytes = base64ToUint8Array(att.base64);
      const queueId = crypto.randomUUID();
      const storagePath = buildStoragePath(queueId, att.filename, receivedDate);

      const { error: uploadError } = await supabase.storage
        .from('email-processing-pdfs')
        .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });

      if (uploadError) {
        throw new Error(`Failed to upload PDF ${att.filename}: ${uploadError.message}`);
      }
      uploadedPaths.push(storagePath);

      const { data: inserted, error: insertError } = await supabase
        .from('email_processing_queue')
        .insert({
          id: queueId,
          source_message_id: emailId,
          provider: providerName,
          email_subject: subject,
          email_from: fromEmail,
          email_received_date: receivedDate,
          matching_rule_id: matchingRule.id,
          processing_mode: processingMode,
          extraction_type_id: matchingRule.extraction_type_id || null,
          transformation_type_id: matchingRule.transformation_type_id || null,
          workflow_v2_id: matchingRule.workflow_v2_id || null,
          original_filename: att.filename,
          storage_path: storagePath,
          page_count: att.pageCount ?? null,
          status: 'pending'
        })
        .select('id')
        .single();

      if (insertError) {
        throw new Error(`Failed to insert queue row for ${att.filename}: ${insertError.message}`);
      }

      insertedIds.push(inserted.id);
      console.log(`[QUEUE] Enqueued ${att.filename} as ${inserted.id} (path=${storagePath})`);
    }
  } catch (captureError) {
    console.error('Capture failure, rolling back partial state:', captureError);

    if (insertedIds.length > 0) {
      await supabase.from('email_processing_queue').delete().in('id', insertedIds);
    }
    if (uploadedPaths.length > 0) {
      await supabase.storage.from('email-processing-pdfs').remove(uploadedPaths);
    }

    return {
      emailResult: {
        id: emailId, from: fromEmail, subject, receivedDate,
        processedSuccessfully: false,
        errorMessage: (captureError as Error).message,
        extractionLogId: null,
        rule: matchingRule.rule_name
      },
      attachments,
      matchingRule,
      parseitId: null,
      queueRowIds: []
    };
  }

  return {
    emailResult: {
      id: emailId, from: fromEmail, subject, receivedDate,
      processedSuccessfully: true,
      errorMessage: null,
      extractionLogId: null,
      rule: matchingRule.rule_name
    },
    attachments,
    matchingRule,
    parseitId: null,
    queueRowIds: insertedIds
  };
}
