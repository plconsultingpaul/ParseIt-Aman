// steps/notifications.ts - Sprint 1: Workflow success/failure notifications

import { getValueByPath } from "../utils.ts";
import { sendOffice365Email, sendGmailEmail } from "./emailProviders.ts";

function processTemplateVariables(template: string, contextData: any): string {
  if (!template || !template.includes('{{')) {
    return template;
  }

  const templatePattern = /\{\{([^}]+)\}\}/g;
  return template.replace(templatePattern, (match, path) => {
    const trimmedPath = path.trim();

    // Handle direct context variables
    if (contextData[trimmedPath] !== undefined) {
      return String(contextData[trimmedPath]);
    }

    // Handle nested paths like response.billNumber
    const parts = trimmedPath.split('.');
    let current = contextData;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return match; // Keep original if path not found
      }
      current = current[part];
    }

    if (current !== undefined && current !== null) {
      return typeof current === 'object' ? JSON.stringify(current) : String(current);
    }

    return match; // Keep original if not found
  });
}

export async function sendFailureNotificationIfEnabled(
  supabaseUrl: string,
  supabaseServiceKey: string,
  extractionTypeId: string,
  errorMessage: string,
  contextData: any,
  workflowExecutionLogId: string | null
): Promise<void> {
  console.log('📧 === CHECKING FAILURE NOTIFICATION SETTINGS ===');

  // Fetch extraction type with notification settings
  const extractionTypeResponse = await fetch(
    `${supabaseUrl}/rest/v1/extraction_types?id=eq.${extractionTypeId}&select=*`,
    {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    }
  );

  if (!extractionTypeResponse.ok) {
    console.log('⚠️ Failed to fetch extraction type settings');
    return;
  }

  const extractionTypes = await extractionTypeResponse.json();
  if (!extractionTypes || extractionTypes.length === 0) {
    console.log('⚠️ Extraction type not found');
    return;
  }

  const extractionType = extractionTypes[0];

  if (!extractionType.enable_failure_notifications) {
    console.log('ℹ️ Failure notifications not enabled for this extraction type');
    return;
  }

  console.log('✅ Failure notifications enabled, fetching template...');

  // Fetch notification template
  let template = null;
  if (extractionType.failure_notification_template_id) {
    const templateResponse = await fetch(
      `${supabaseUrl}/rest/v1/notification_templates?id=eq.${extractionType.failure_notification_template_id}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      }
    );
    if (templateResponse.ok) {
      const templates = await templateResponse.json();
      if (templates && templates.length > 0) {
        template = templates[0];
      }
    }
  }

  // Fall back to global default template
  if (!template) {
    console.log('📧 Using global default failure template');
    const defaultTemplateResponse = await fetch(
      `${supabaseUrl}/rest/v1/notification_templates?template_type=eq.failure&is_global_default=eq.true&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      }
    );
    if (defaultTemplateResponse.ok) {
      const templates = await defaultTemplateResponse.json();
      if (templates && templates.length > 0) {
        template = templates[0];
      }
    }
  }

  if (!template) {
    console.log('⚠️ No notification template found');
    return;
  }

  // Build notification context
  // Timestamp is already pre-formatted in contextData from index.ts
  const notificationContext = {
    ...contextData,
    error_message: errorMessage,
    pdf_filename: contextData.originalPdfFilename || contextData.pdfFilename || 'unknown.pdf',
    extraction_type_name: extractionType.name,
    sender_email: contextData.senderEmail || contextData.submitterEmail || 'unknown',
    submitter_email: contextData.submitterEmail || contextData.senderEmail || 'unknown'
  };

  // Determine recipient email
  let recipientEmail = extractionType.failure_recipient_email_override || template.recipient_email;

  if (!recipientEmail) {
    console.log('⚠️ No recipient email configured for failure notifications');
    return;
  }

  // Process template variables
  recipientEmail = processTemplateVariables(recipientEmail, notificationContext);
  const subject = processTemplateVariables(template.subject_template, notificationContext);
  const body = processTemplateVariables(template.body_template, notificationContext);

  console.log('📧 Sending failure notification:');
  console.log('  To:', recipientEmail);
  console.log('  Subject:', subject);

  // Send the notification email
  let sendStatus = 'sent';
  let sendError = null;

  try {
    await sendNotificationEmail(
      supabaseUrl,
      supabaseServiceKey,
      {
        to: recipientEmail,
        subject,
        body,
        cc: template.cc_emails,
        bcc: template.bcc_emails
      },
      template.attach_pdf ? {
        filename: notificationContext.pdf_filename,
        content: contextData.pdfBase64
      } : null
    );
  } catch (emailError: any) {
    sendStatus = 'failed';
    sendError = emailError.message || String(emailError);
    console.error('❌ Failed to send notification:', sendError);
  }

  // Log notification to notification_logs table
  await logNotification(
    supabaseUrl,
    supabaseServiceKey,
    {
      workflowExecutionLogId,
      extractionTypeId,
      notificationType: 'failure',
      recipientEmail,
      subject,
      body,
      ccEmails: template.cc_emails,
      bccEmails: template.bcc_emails,
      sendStatus,
      errorMessage: sendError,
      pdfAttached: template.attach_pdf || false,
      templateId: template.id
    }
  );

  // Update workflow log
  if (workflowExecutionLogId && sendStatus === 'sent') {
    await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${workflowExecutionLogId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({
        failure_notification_sent: true,
        notification_sent_at: new Date().toISOString()
      })
    });
  }

  if (sendStatus === 'sent') {
    console.log('✅ Failure notification sent successfully');
  } else {
    throw new Error(`Failed to send notification: ${sendError}`);
  }
}

export async function sendSuccessNotificationIfEnabled(
  supabaseUrl: string,
  supabaseServiceKey: string,
  extractionTypeId: string,
  contextData: any,
  workflowExecutionLogId: string | null
): Promise<void> {
  console.log('📧 === CHECKING SUCCESS NOTIFICATION SETTINGS ===');

  // Fetch extraction type with notification settings
  const extractionTypeResponse = await fetch(
    `${supabaseUrl}/rest/v1/extraction_types?id=eq.${extractionTypeId}&select=*`,
    {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    }
  );

  if (!extractionTypeResponse.ok) {
    console.log('⚠️ Failed to fetch extraction type settings');
    return;
  }

  const extractionTypes = await extractionTypeResponse.json();
  if (!extractionTypes || extractionTypes.length === 0) {
    console.log('⚠️ Extraction type not found');
    return;
  }

  const extractionType = extractionTypes[0];

  if (!extractionType.enable_success_notifications) {
    console.log('ℹ️ Success notifications not enabled for this extraction type');
    return;
  }

  console.log('✅ Success notifications enabled, fetching template...');

  // Fetch notification template
  let template = null;
  if (extractionType.success_notification_template_id) {
    const templateResponse = await fetch(
      `${supabaseUrl}/rest/v1/notification_templates?id=eq.${extractionType.success_notification_template_id}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      }
    );
    if (templateResponse.ok) {
      const templates = await templateResponse.json();
      if (templates && templates.length > 0) {
        template = templates[0];
      }
    }
  }

  // Fall back to global default template
  if (!template) {
    console.log('📧 Using global default success template');
    const defaultTemplateResponse = await fetch(
      `${supabaseUrl}/rest/v1/notification_templates?template_type=eq.success&is_global_default=eq.true&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      }
    );
    if (defaultTemplateResponse.ok) {
      const templates = await defaultTemplateResponse.json();
      if (templates && templates.length > 0) {
        template = templates[0];
      }
    }
  }

  if (!template) {
    console.log('⚠️ No notification template found');
    return;
  }

  // DEBUG: Log raw template from database
  console.log('📧 DEBUG === RAW TEMPLATE FROM DATABASE ===');
  console.log('📧 DEBUG - template.body_template (JSON):', JSON.stringify(template.body_template));
  console.log('📧 DEBUG - template.body_template length:', template.body_template?.length);

  // Build notification context
  // Timestamp is already pre-formatted in contextData from index.ts
  const notificationContext = {
    ...contextData,
    pdf_filename: contextData.originalPdfFilename || contextData.pdfFilename || 'unknown.pdf',
    extraction_type_name: extractionType.name,
    sender_email: contextData.senderEmail || contextData.submitterEmail || 'unknown',
    submitter_email: contextData.submitterEmail || contextData.senderEmail || 'unknown'
  };

  // Determine recipient email (default to sender_email or submitter_email for success notifications)
  let recipientEmail = extractionType.success_recipient_email_override || template.recipient_email || contextData.senderEmail || contextData.submitterEmail;

  if (!recipientEmail) {
    console.log('⚠️ No recipient email configured for success notifications');
    return;
  }

  // Process template variables
  recipientEmail = processTemplateVariables(recipientEmail, notificationContext);
  const subject = processTemplateVariables(template.subject_template, notificationContext);
  const body = processTemplateVariables(template.body_template, notificationContext);

  // DEBUG: Log body after template processing
  console.log('📧 DEBUG === BODY AFTER TEMPLATE PROCESSING ===');
  console.log('📧 DEBUG - body (JSON):', JSON.stringify(body));

  console.log('📧 Sending success notification:');
  console.log('  To:', recipientEmail);
  console.log('  Subject:', subject);

  // Send the notification email
  let sendStatus = 'sent';
  let sendError = null;

  try {
    await sendNotificationEmail(
      supabaseUrl,
      supabaseServiceKey,
      {
        to: recipientEmail,
        subject,
        body,
        cc: template.cc_emails,
        bcc: template.bcc_emails
      },
      template.attach_pdf ? {
        filename: notificationContext.pdf_filename,
        content: contextData.pdfBase64
      } : null
    );
  } catch (emailError: any) {
    sendStatus = 'failed';
    sendError = emailError.message || String(emailError);
    console.error('❌ Failed to send notification:', sendError);
  }

  // Log notification to notification_logs table
  await logNotification(
    supabaseUrl,
    supabaseServiceKey,
    {
      workflowExecutionLogId,
      extractionTypeId,
      notificationType: 'success',
      recipientEmail,
      subject,
      body,
      ccEmails: template.cc_emails,
      bccEmails: template.bcc_emails,
      sendStatus,
      errorMessage: sendError,
      pdfAttached: template.attach_pdf || false,
      templateId: template.id
    }
  );

  // Update workflow log
  if (workflowExecutionLogId && sendStatus === 'sent') {
    await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${workflowExecutionLogId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({
        success_notification_sent: true,
        notification_sent_at: new Date().toISOString()
      })
    });
  }

  if (sendStatus === 'sent') {
    console.log('✅ Success notification sent successfully');
  } else {
    throw new Error(`Failed to send notification: ${sendError}`);
  }
}

async function sendNotificationEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  email: { to: string; subject: string; body: string; cc?: string | null; bcc?: string | null },
  attachment: { filename: string; content: string } | null
): Promise<void> {
  console.log('📧 === SENDING NOTIFICATION EMAIL ===');

  // Fetch email configuration
  const emailConfigResponse = await fetch(`${supabaseUrl}/rest/v1/email_monitoring_config?limit=1`, {
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey
    }
  });

  if (!emailConfigResponse.ok) {
    throw new Error('Email configuration not found');
  }

  const emailConfigData = await emailConfigResponse.json();
  if (!emailConfigData || emailConfigData.length === 0) {
    throw new Error('Email configuration not found');
  }

  const emailConfigRecord = emailConfigData[0];
  const emailConfig = {
    provider: emailConfigRecord.provider || 'office365',
    office365: emailConfigRecord.provider === 'office365' ? {
      tenant_id: emailConfigRecord.tenant_id,
      client_id: emailConfigRecord.client_id,
      client_secret: emailConfigRecord.client_secret,
      default_send_from_email: emailConfigRecord.default_send_from_email
    } : undefined,
    gmail: emailConfigRecord.provider === 'gmail' ? {
      client_id: emailConfigRecord.gmail_client_id,
      client_secret: emailConfigRecord.gmail_client_secret,
      refresh_token: emailConfigRecord.gmail_refresh_token,
      default_send_from_email: emailConfigRecord.default_send_from_email
    } : undefined
  };

  // DEBUG LOGGING: Investigate newline formatting issue
  console.log('📧 DEBUG === EMAIL BODY ANALYSIS ===');
  console.log('📧 DEBUG - email.body length:', email.body.length);
  console.log('📧 DEBUG - email.body raw (JSON):', JSON.stringify(email.body));
  console.log('📧 DEBUG - contains actual \\n:', email.body.includes('\n'));
  console.log('📧 DEBUG - contains \\r\\n:', email.body.includes('\r\n'));
  console.log('📧 DEBUG - contains literal backslash-n:', email.body.includes('\\n'));

  // Check character codes for first 200 chars to see what's actually in there
  const charCodes = email.body.slice(0, 200).split('').map((c, i) => {
    if (c === '\n') return `[${i}:LF]`;
    if (c === '\r') return `[${i}:CR]`;
    return '';
  }).filter(Boolean).join('');
  console.log('📧 DEBUG - newline char positions:', charCodes || 'NONE FOUND');

  // Try multiple replacement strategies
  let formattedBody = email.body;

  // Strategy 1: Replace actual newlines
  const beforeReplace1 = formattedBody;
  formattedBody = formattedBody.replace(/\r?\n/g, '<br>');
  console.log('📧 DEBUG - After \\r?\\n replace, changed:', beforeReplace1 !== formattedBody);

  // Strategy 2: Replace literal \n strings (escaped in JSON/database)
  const beforeReplace2 = formattedBody;
  formattedBody = formattedBody.replace(/\\n/g, '<br>');
  console.log('📧 DEBUG - After \\\\n literal replace, changed:', beforeReplace2 !== formattedBody);

  console.log('📧 DEBUG - formattedBody (JSON):', JSON.stringify(formattedBody));
  console.log('📧 DEBUG - formattedBody contains <br>:', formattedBody.includes('<br>'));

  const htmlBody = `<html><body style="font-family: Arial, sans-serif;">${formattedBody}</body></html>`;
  console.log('📧 DEBUG - Final htmlBody:', htmlBody);

  let emailResult;
  if (emailConfig.provider === 'office365') {
    emailResult = await sendOffice365Email(
      emailConfig.office365!,
      {
        to: email.to,
        subject: email.subject,
        body: htmlBody,
        from: emailConfig.office365!.default_send_from_email,
        cc: email.cc
      },
      attachment
    );
  } else {
    emailResult = await sendGmailEmail(
      emailConfig.gmail!,
      {
        to: email.to,
        subject: email.subject,
        body: htmlBody,
        from: emailConfig.gmail!.default_send_from_email,
        cc: email.cc
      },
      attachment
    );
  }

  if (!emailResult.success) {
    throw new Error(`Email sending failed: ${emailResult.error}`);
  }

  console.log('✅ Notification email sent successfully');
}

async function logNotification(
  supabaseUrl: string,
  supabaseServiceKey: string,
  logData: {
    workflowExecutionLogId: string | null;
    extractionTypeId: string;
    notificationType: 'failure' | 'success';
    recipientEmail: string;
    subject: string;
    body: string;
    ccEmails?: string | null;
    bccEmails?: string | null;
    sendStatus: string;
    errorMessage: string | null;
    pdfAttached: boolean;
    templateId: string;
  }
): Promise<void> {
  try {
    const logRecord = {
      workflow_execution_log_id: logData.workflowExecutionLogId,
      extraction_type_id: logData.extractionTypeId,
      notification_type: logData.notificationType,
      recipient_email: logData.recipientEmail,
      subject: logData.subject,
      body: logData.body,
      cc_emails: logData.ccEmails,
      bcc_emails: logData.bccEmails,
      send_status: logData.sendStatus,
      error_message: logData.errorMessage,
      pdf_attached: logData.pdfAttached,
      template_id: logData.templateId,
      sent_at: new Date().toISOString()
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/notification_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify(logRecord)
    });

    if (!response.ok) {
      console.error('⚠️ Failed to log notification to database');
    } else {
      console.log('📝 Notification logged to notification_logs table');
    }
  } catch (error) {
    console.error('⚠️ Error logging notification:', error);
  }
}
