// steps/email.ts - Email action step execution

import { getValueByPath } from "../utils.ts";
import { sendOffice365Email, sendGmailEmail, extractSpecificPageFromPdf } from "./emailProviders.ts";

export async function executeEmailAction(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<any> {
  console.log('📧 === EXECUTING EMAIL ACTION STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Email config:', JSON.stringify(config, null, 2));

  const isNotificationEmail = config.isNotificationEmail || false;
  if (isNotificationEmail && config.notificationTemplateId) {
    console.log('📧 Notification mode enabled - loading template:', config.notificationTemplateId);
    return await executeNotificationEmail(config, contextData, supabaseUrl, supabaseServiceKey, step);
  }

  const processTemplateWithMapping = (template: string, contextData: any, templateName = 'template') => {
    const mappings: Record<string, any> = {};

    if (!template || !template.includes('{{')) {
      return { processed: template, mappings };
    }

    const templatePattern = /\{\{([^}]+)\}\}/g;
    const processed = template.replace(templatePattern, (match, path) => {
      const trimmedPath = path.trim();
      const value = getValueByPath(contextData, trimmedPath);
      mappings[trimmedPath] = value !== undefined ? value : null;

      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
      }
      return value !== undefined ? String(value) : match;
    });

    console.log(`\n📝 === TEMPLATE SUBSTITUTION: ${templateName} ===`);
    console.log('📋 Template:', template);
    console.log('🔍 Field Mappings:');
    Object.entries(mappings).forEach(([field, value]) => {
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
      console.log(`   ${field} → ${displayValue}`);
    });
    console.log('✅ Final Result:', processed);
    console.log('='.repeat(50));

    return { processed, mappings };
  };

  const allFieldMappings: Record<string, any> = {};
  const processedConfig: any = {};

  const toResult = processTemplateWithMapping(config.to, contextData, 'Email To');
  processedConfig.to = toResult.processed;
  Object.assign(allFieldMappings, toResult.mappings);

  const subjectResult = processTemplateWithMapping(config.subject, contextData, 'Email Subject');
  processedConfig.subject = subjectResult.processed;
  Object.assign(allFieldMappings, subjectResult.mappings);

  const bodyResult = processTemplateWithMapping(config.body, contextData, 'Email Body');
  processedConfig.body = bodyResult.processed;
  Object.assign(allFieldMappings, bodyResult.mappings);

  if (config.from) {
    const fromResult = processTemplateWithMapping(config.from, contextData, 'Email From');
    processedConfig.from = fromResult.processed;
    Object.assign(allFieldMappings, fromResult.mappings);
  }

  let pdfAttachment = null;
  if (config.includeAttachment && contextData.pdfBase64) {
    let attachmentFilename;
    const attachmentSource = config.attachmentSource || 'transform_setup_pdf';

    console.log('📧 Attachment source selected:', attachmentSource);
    console.log('📧 Available filenames in context:');
    console.log('  - renamedFilename (from rename step):', contextData.renamedFilename);
    console.log('  - transformSetupFilename (from transform setup):', contextData.transformSetupFilename);
    console.log('  - pdfFilename (current):', contextData.pdfFilename);
    console.log('  - originalPdfFilename:', contextData.originalPdfFilename);

    if (attachmentSource === 'renamed_pdf_step') {
      if (contextData.renamedFilename) {
        attachmentFilename = contextData.renamedFilename;
        console.log('📧 ✅ Using renamedFilename from rename step:', attachmentFilename);
      } else {
        attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf';
        console.log('📧 ⚠️  No renamedFilename from step, falling back to originalPdfFilename:', attachmentFilename);
      }
    } else if (attachmentSource === 'transform_setup_pdf') {
      if (contextData.transformSetupFilename) {
        attachmentFilename = contextData.transformSetupFilename;
        console.log('📧 ✅ Using transformSetupFilename from transform setup:', attachmentFilename);
      } else if (contextData.pdfFilename) {
        attachmentFilename = contextData.pdfFilename;
        console.log('📧 ✅ Using pdfFilename from transform setup:', attachmentFilename);
      } else {
        attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf';
        console.log('📧 ⚠️  No transform setup filename, falling back to originalPdfFilename:', attachmentFilename);
      }
    } else if (attachmentSource === 'original_pdf') {
      attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf';
      console.log('Using originalPdfFilename:', attachmentFilename);
    } else if (attachmentSource === 'extraction_type_filename') {
      if (contextData.extractionTypeFilename) {
        const filenameResult = processTemplateWithMapping(contextData.extractionTypeFilename, contextData, 'Extraction Type Filename');
        attachmentFilename = filenameResult.processed;
        Object.assign(allFieldMappings, filenameResult.mappings);
        console.log('Using extractionTypeFilename from extraction type:', attachmentFilename);
      } else {
        attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf';
        console.log('No extractionTypeFilename available, falling back to originalPdfFilename:', attachmentFilename);
      }
    } else {
      if (contextData.renamedFilename) {
        attachmentFilename = contextData.renamedFilename;
        console.log('📧 ✅ Using renamedFilename (legacy mode):', attachmentFilename);
      } else if (contextData.extractionTypeFilename) {
        const filenameResult = processTemplateWithMapping(contextData.extractionTypeFilename, contextData, 'Extraction Type Filename');
        attachmentFilename = filenameResult.processed;
        Object.assign(allFieldMappings, filenameResult.mappings);
        console.log('Using extractionTypeFilename from extraction type:', attachmentFilename);
      } else {
        attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf';
        console.log('📧 ⚠️  Using fallback to originalPdfFilename (legacy mode):', attachmentFilename);
      }
    }

    let pdfContent = contextData.pdfBase64;
    const pdfEmailStrategy = config.pdfEmailStrategy || 'all_pages_in_group';

    if (pdfEmailStrategy === 'specific_page_in_group' && config.specificPageToEmail) {
      const pageToEmail = config.specificPageToEmail;
      console.log(`📧 Extracting page ${pageToEmail} from PDF for email attachment`);

      try {
        pdfContent = await extractSpecificPageFromPdf(contextData.pdfBase64, pageToEmail);
        console.log(`📧 ✅ Successfully extracted page ${pageToEmail} from PDF`);
      } catch (extractError) {
        console.error(`📧 ❌ Failed to extract page ${pageToEmail}:`, extractError);
        throw new Error(`Failed to extract page ${pageToEmail} from PDF: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
      }
    } else {
      console.log('📧 Using full PDF (all pages in group) for email attachment');
    }

    pdfAttachment = {
      filename: attachmentFilename,
      content: pdfContent
    };

    console.log('📧 PDF attachment prepared with filename:', attachmentFilename);
  }

  let ccEmail = null;
  if (config.ccUser && contextData.userId) {
    console.log('📧 CC User enabled, fetching user email for userId:', contextData.userId);
    try {
      const userResponse = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${contextData.userId}&select=email`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        }
      );
      if (userResponse.ok) {
        const users = await userResponse.json();
        if (users && users.length > 0 && users[0].email) {
          ccEmail = users[0].email;
          console.log('📧 ✅ User email retrieved for CC:', ccEmail);
        } else {
          console.log('📧 ⚠️ User email not found in database for userId:', contextData.userId);
        }
      } else {
        console.log('📧 ⚠️ Failed to fetch user email:', userResponse.status);
      }
    } catch (userError) {
      console.error('📧 ❌ Error fetching user email:', userError);
    }
  }

  console.log('\n📧 === FINAL EMAIL DETAILS ===');
  console.log('To:', processedConfig.to);
  console.log('CC:', ccEmail || 'none');
  console.log('Subject:', processedConfig.subject);
  console.log('From:', processedConfig.from || '(default)');
  console.log('Attachment:', pdfAttachment ? pdfAttachment.filename : 'none');
  console.log('='.repeat(50));

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

  let emailResult;
  if (emailConfig.provider === 'office365') {
    emailResult = await sendOffice365Email(emailConfig.office365!, {
      to: processedConfig.to,
      subject: processedConfig.subject,
      body: processedConfig.body,
      from: processedConfig.from || emailConfig.office365!.default_send_from_email,
      cc: ccEmail
    }, pdfAttachment);
  } else {
    emailResult = await sendGmailEmail(emailConfig.gmail!, {
      to: processedConfig.to,
      subject: processedConfig.subject,
      body: processedConfig.body,
      from: processedConfig.from || emailConfig.gmail!.default_send_from_email,
      cc: ccEmail
    }, pdfAttachment);
  }

  if (!emailResult.success) {
    throw new Error(`Email sending failed: ${emailResult.error}`);
  }

  return {
    success: true,
    message: 'Email sent successfully',
    emailResult,
    processedConfig: {
      ...processedConfig,
      cc: ccEmail
    },
    fieldMappings: allFieldMappings,
    attachmentIncluded: !!pdfAttachment,
    attachmentFilename: pdfAttachment?.filename
  };
}

async function executeNotificationEmail(
  config: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  step: any
): Promise<any> {
  console.log('📧 === EXECUTING NOTIFICATION EMAIL ===');

  const templateResponse = await fetch(
    `${supabaseUrl}/rest/v1/notification_templates?id=eq.${config.notificationTemplateId}`,
    {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    }
  );

  if (!templateResponse.ok) {
    throw new Error(`Failed to load notification template: ${templateResponse.status}`);
  }

  const templates = await templateResponse.json();
  if (!templates || templates.length === 0) {
    throw new Error('Notification template not found');
  }

  const template = templates[0];
  console.log('📧 Loaded notification template:', template.template_name);

  const notificationContext: Record<string, any> = {
    ...contextData,
    timestamp: new Date().toISOString(),
    pdf_filename: contextData.originalPdfFilename || contextData.pdfFilename || 'unknown.pdf',
    sender_email: contextData.senderEmail || contextData.sender_email
  };

  console.log('📧 Notification context sender_email:', notificationContext.sender_email);

  const processTemplateVariables = (text: string, ctx: any): string => {
    if (!text || !text.includes('{{')) {
      return text;
    }

    const templatePattern = /\{\{([^}]+)\}\}/g;
    return text.replace(templatePattern, (match, path) => {
      const trimmedPath = path.trim();
      const value = getValueByPath(ctx, trimmedPath);

      if (value === null || value === undefined) {
        return match;
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  };

  if (config.customFieldMappings && typeof config.customFieldMappings === 'object') {
    console.log('📧 Processing custom field mappings:', JSON.stringify(config.customFieldMappings));

    for (const [fieldName, templateValue] of Object.entries(config.customFieldMappings)) {
      if (typeof templateValue === 'string' && templateValue.trim()) {
        const resolvedValue = processTemplateVariables(templateValue, contextData);
        notificationContext[fieldName] = resolvedValue;
        console.log(`📧 Custom field mapping: ${fieldName} = "${templateValue}" -> "${resolvedValue}"`);
      }
    }
  }

  const recipientEmail = config.recipientEmailOverride || template.recipient_email;
  const processedRecipient = processTemplateVariables(recipientEmail, notificationContext);
  const processedSubject = processTemplateVariables(template.subject_template, notificationContext);
  const processedBody = processTemplateVariables(template.body_template, notificationContext);

  console.log('📧 Processed notification email:');
  console.log('  To:', processedRecipient);
  console.log('  Subject:', processedSubject);
  console.log('  Attach PDF:', config.includeAttachment !== undefined ? config.includeAttachment : template.attach_pdf);

  let pdfAttachment = null;
  const shouldAttachPdf = config.includeAttachment !== undefined ? config.includeAttachment : template.attach_pdf;

  if (shouldAttachPdf && contextData.pdfBase64) {
    const attachmentFilename = contextData.pdfFilename || contextData.originalPdfFilename || 'attachment.pdf';
    pdfAttachment = {
      filename: attachmentFilename,
      content: contextData.pdfBase64
    };
    console.log('📧 PDF attachment prepared:', attachmentFilename);
  }

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

  const htmlBody = processedBody.replace(/\n/g, '<br>');

  let emailResult;
  if (emailConfig.provider === 'office365') {
    emailResult = await sendOffice365Email(emailConfig.office365!, {
      to: processedRecipient,
      subject: processedSubject,
      body: htmlBody,
      from: emailConfig.office365!.default_send_from_email,
      cc: template.cc_emails ? processTemplateVariables(template.cc_emails, notificationContext) : undefined
    }, pdfAttachment);
  } else {
    emailResult = await sendGmailEmail(emailConfig.gmail!, {
      to: processedRecipient,
      subject: processedSubject,
      body: htmlBody,
      from: emailConfig.gmail!.default_send_from_email,
      cc: template.cc_emails ? processTemplateVariables(template.cc_emails, notificationContext) : undefined
    }, pdfAttachment);
  }

  if (!emailResult.success) {
    throw new Error(`Notification email sending failed: ${emailResult.error}`);
  }

  const workflowExecutionLogId = contextData.workflow_execution_log_id || contextData.workflowExecutionLogId;
  const extractionTypeId = contextData.extraction_type_id || contextData.extractionTypeId;

  const notificationLog = {
    workflow_execution_log_id: workflowExecutionLogId || null,
    extraction_type_id: extractionTypeId || null,
    notification_type: template.template_type,
    recipient_email: processedRecipient,
    subject: processedSubject,
    body: processedBody,
    cc_emails: template.cc_emails || null,
    bcc_emails: template.bcc_emails || null,
    send_status: 'sent',
    pdf_attached: !!pdfAttachment,
    template_id: template.id
  };

  console.log('📧 Logging notification to notification_logs table');
  await fetch(`${supabaseUrl}/rest/v1/notification_logs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(notificationLog)
  });

  console.log('📧 ✅ Notification email sent and logged successfully');

  const customFieldsApplied = config.customFieldMappings
    ? Object.keys(config.customFieldMappings).filter(k => config.customFieldMappings[k]?.trim())
    : [];

  return {
    success: true,
    message: 'Notification email sent successfully',
    emailResult,
    notificationMode: true,
    templateUsed: template.template_name,
    processedConfig: {
      to: processedRecipient,
      subject: processedSubject,
      body: processedBody,
      cc: template.cc_emails || null
    },
    customFieldsApplied: customFieldsApplied.length > 0 ? customFieldsApplied : undefined,
    attachmentIncluded: !!pdfAttachment,
    attachmentFilename: pdfAttachment?.filename
  };
}
