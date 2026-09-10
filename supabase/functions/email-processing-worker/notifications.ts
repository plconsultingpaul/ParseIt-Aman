import { sendOffice365Email, sendGmailEmail } from './emailProviders.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export interface QueueFailureContext {
  queueId: string;
  processingMode: string;
  originalFilename: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
  emailReceivedDate: string | null;
  matchingRuleName: string | null;
  extractionTypeId: string | null;
  extractionTypeName: string | null;
  transformationTypeId: string | null;
  transformationTypeName: string | null;
  workflowV2Id: string | null;
  workflowV2Name: string | null;
  errorMessage: string;
  storagePath: string | null;
  isTest?: boolean;
}

interface NotificationTemplate {
  id: string;
  template_name: string;
  template_type: string;
  recipient_email: string | null;
  subject_template: string;
  body_template: string;
  attach_pdf: boolean;
  cc_emails: string | null;
  bcc_emails: string | null;
  is_global_default: boolean;
}

interface EmailMonitoringConfig {
  provider: 'gmail' | 'office365' | null;
  default_send_from_email: string | null;
  monitoring_tenant_id: string | null;
  monitoring_client_id: string | null;
  monitoring_client_secret: string | null;
  gmail_monitoring_client_id: string | null;
  gmail_monitoring_client_secret: string | null;
  gmail_monitoring_refresh_token: string | null;
  enable_failure_notifications: boolean;
  failure_notification_template_id: string | null;
  failure_recipient_email_override: string | null;
}

function processTemplateVariables(template: string, contextData: Record<string, any>): string {
  if (!template || !template.includes('{{')) return template || '';
  const pattern = /\{\{([^}]+)\}\}/g;
  return template.replace(pattern, (match, path) => {
    const trimmedPath = String(path).trim();
    if (contextData[trimmedPath] !== undefined && contextData[trimmedPath] !== null) {
      return String(contextData[trimmedPath]);
    }
    const parts = trimmedPath.split('.');
    let current: any = contextData;
    for (const part of parts) {
      if (current === null || current === undefined) return match;
      current = current[part];
    }
    if (current !== undefined && current !== null) {
      return typeof current === 'object' ? JSON.stringify(current) : String(current);
    }
    return match;
  });
}

async function loadConfig(supabase: any): Promise<EmailMonitoringConfig | null> {
  const { data, error } = await supabase
    .from('email_monitoring_config')
    .select(
      'provider, default_send_from_email, monitoring_tenant_id, monitoring_client_id, monitoring_client_secret, gmail_monitoring_client_id, gmail_monitoring_client_secret, gmail_monitoring_refresh_token, enable_failure_notifications, failure_notification_template_id, failure_recipient_email_override'
    )
    .maybeSingle();
  if (error) {
    console.warn('[NOTIFY] Failed to load email_monitoring_config:', error.message);
    return null;
  }
  return data as EmailMonitoringConfig | null;
}

async function loadTemplate(supabase: any, templateId: string | null): Promise<NotificationTemplate | null> {
  if (templateId) {
    const { data } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();
    if (data) return data as NotificationTemplate;
  }
  const { data: globalDefault } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('template_type', 'failure')
    .eq('is_global_default', true)
    .limit(1)
    .maybeSingle();
  return (globalDefault as NotificationTemplate) || null;
}

async function resolvePerTypeSettings(
  supabase: any,
  ctx: QueueFailureContext
): Promise<{ enabled: boolean; templateId: string | null; recipientOverride: string | null } | null> {
  if (ctx.extractionTypeId) {
    const { data } = await supabase
      .from('extraction_types')
      .select('enable_failure_notifications, failure_notification_template_id, failure_recipient_email_override, name')
      .eq('id', ctx.extractionTypeId)
      .maybeSingle();
    if (data) {
      ctx.extractionTypeName = ctx.extractionTypeName || data.name || null;
      if (data.enable_failure_notifications) {
        return {
          enabled: true,
          templateId: data.failure_notification_template_id || null,
          recipientOverride: data.failure_recipient_email_override || null,
        };
      }
    }
  }
  return null;
}

async function downloadPdfBase64(supabase: any, storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from('email-processing-pdfs').download(storagePath);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
    }
    return btoa(binary);
  } catch (err) {
    console.warn('[NOTIFY] PDF download for attachment failed:', (err as Error).message);
    return null;
  }
}

async function logNotification(
  supabase: any,
  payload: {
    templateId: string;
    recipient: string;
    subject: string;
    body: string;
    cc: string | null;
    bcc: string | null;
    status: 'sent' | 'failed';
    error: string | null;
    attached: boolean;
    queueId: string;
  }
): Promise<void> {
  try {
    await supabase.from('notification_logs').insert({
      template_id: payload.templateId,
      notification_type: 'failure',
      recipient_email: payload.recipient,
      subject: payload.subject,
      body: payload.body,
      cc_emails: payload.cc,
      bcc_emails: payload.bcc,
      send_status: payload.status,
      error_message: payload.error,
      pdf_attached: payload.attached,
    });
  } catch (err) {
    console.warn('[NOTIFY] notification_logs insert failed:', (err as Error).message);
  }
}

export async function sendQueueFailureNotification(
  supabase: any,
  ctx: QueueFailureContext
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const config = await loadConfig(supabase);
  if (!config) {
    return { sent: false, skipped: 'email_monitoring_config missing' };
  }

  const perType = await resolvePerTypeSettings(supabase, ctx);
  const siteEnabled = !!config.enable_failure_notifications;

  if (!perType && !siteEnabled) {
    return { sent: false, skipped: 'failure notifications not enabled' };
  }

  const templateId = perType?.templateId || config.failure_notification_template_id || null;
  const template = await loadTemplate(supabase, templateId);
  if (!template) {
    return { sent: false, skipped: 'no notification template resolved' };
  }

  const recipient =
    perType?.recipientOverride ||
    config.failure_recipient_email_override ||
    template.recipient_email ||
    '';

  if (!recipient) {
    return { sent: false, skipped: 'no recipient configured' };
  }

  const failedAt = new Date().toISOString();
  const variables: Record<string, any> = {
    queue_id: ctx.queueId,
    processing_mode: ctx.processingMode,
    original_filename: ctx.originalFilename || 'unknown.pdf',
    pdf_filename: ctx.originalFilename || 'unknown.pdf',
    email_subject: ctx.emailSubject || '',
    email_from: ctx.emailFrom || '',
    sender_email: ctx.emailFrom || '',
    email_received_date: ctx.emailReceivedDate || '',
    matching_rule_name: ctx.matchingRuleName || '',
    extraction_type_name: ctx.extractionTypeName || '',
    transformation_type_name: ctx.transformationTypeName || '',
    workflow_name: ctx.workflowV2Name || '',
    error_message: ctx.errorMessage,
    failed_at: failedAt,
    is_test: ctx.isTest ? 'true' : 'false',
  };

  const renderedRecipient = processTemplateVariables(recipient, variables);
  let subject = processTemplateVariables(template.subject_template || '', variables);
  const body = processTemplateVariables(template.body_template || '', variables);
  if (ctx.isTest) subject = `[TEST] ${subject}`;

  const provider = config.provider;
  const fromAddress = config.default_send_from_email || '';

  if (!fromAddress) {
    return { sent: false, skipped: 'default_send_from_email not configured' };
  }

  let attachment: { filename: string; content: string } | null = null;
  if (template.attach_pdf && ctx.storagePath && !ctx.isTest) {
    const base64 = await downloadPdfBase64(supabase, ctx.storagePath);
    if (base64) {
      attachment = { filename: ctx.originalFilename || 'attachment.pdf', content: base64 };
    }
  }

  let sendResult: { success: boolean; error?: string };
  if (provider === 'gmail') {
    if (
      !config.gmail_monitoring_client_id ||
      !config.gmail_monitoring_client_secret ||
      !config.gmail_monitoring_refresh_token
    ) {
      return { sent: false, skipped: 'Gmail monitoring credentials missing' };
    }
    sendResult = await sendGmailEmail(
      {
        client_id: config.gmail_monitoring_client_id,
        client_secret: config.gmail_monitoring_client_secret,
        refresh_token: config.gmail_monitoring_refresh_token,
        default_send_from_email: fromAddress,
      },
      {
        to: renderedRecipient,
        subject,
        body,
        from: fromAddress,
        cc: template.cc_emails || null,
        bcc: template.bcc_emails || null,
      },
      attachment
    );
  } else {
    if (
      !config.monitoring_tenant_id ||
      !config.monitoring_client_id ||
      !config.monitoring_client_secret
    ) {
      return { sent: false, skipped: 'Office365 monitoring credentials missing' };
    }
    sendResult = await sendOffice365Email(
      {
        tenant_id: config.monitoring_tenant_id,
        client_id: config.monitoring_client_id,
        client_secret: config.monitoring_client_secret,
        default_send_from_email: fromAddress,
      },
      {
        to: renderedRecipient,
        subject,
        body,
        from: fromAddress,
        cc: template.cc_emails || null,
        bcc: template.bcc_emails || null,
      },
      attachment
    );
  }

  await logNotification(supabase, {
    templateId: template.id,
    recipient: renderedRecipient,
    subject,
    body,
    cc: template.cc_emails || null,
    bcc: template.bcc_emails || null,
    status: sendResult.success ? 'sent' : 'failed',
    error: sendResult.success ? null : sendResult.error || null,
    attached: !!attachment,
    queueId: ctx.queueId,
  });

  if (!sendResult.success) {
    return { sent: false, error: sendResult.error || 'Unknown send error' };
  }
  return { sent: true };
}

// Referenced so the linter keeps the import even if only used in worker.
export const _fetchTag = SUPABASE_URL && SERVICE_ROLE_KEY ? 'ok' : 'ok';
