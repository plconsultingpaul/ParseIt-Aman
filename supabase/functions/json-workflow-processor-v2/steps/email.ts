// steps/email.ts - Email action step execution

import { getValueByPath } from "../utils.ts";
import { sendOffice365Email, sendGmailEmail, extractSpecificPageFromPdf, mergePdfsBase64 } from "./emailProviders.ts";

function sanitizePdfFilename(name: string): string {
  const safe = (name || 'attachment').replace(/[\r\n"\\/]+/g, '_').trim();
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}

function formatBodyAsHtml(body: string): string {
  if (!body) return '';
  if (/<\/?[a-z][\s\S]*?>/i.test(body)) return body;
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const withBreaks = escaped.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #111827;">${withBreaks}</div>`;
}

async function buildImagingAttachments(
  contextData: any,
  attachmentMode: string,
  filenameTemplate: string | undefined,
  processTemplate: (t: string, c: any, name?: string) => string
): Promise<Array<{ filename: string; content: string }>> {
  const list: Array<{ filename: string; base64: string }> = Array.isArray(contextData.imagingAttachments)
    ? contextData.imagingAttachments
    : [];
  if (list.length === 0) {
    console.log('📧 imaging_document: no imagingAttachments on context');
    return [];
  }
  const mergedFilename = () => {
    const base = filenameTemplate ? processTemplate(filenameTemplate, contextData, 'Attachment Filename') : 'imaging.pdf';
    return sanitizePdfFilename(base);
  };
  if (attachmentMode === 'merged' && list.length > 1) {
    console.log(`📧 imaging_document: merging ${list.length} PDFs into one`);
    const mergedB64 = await mergePdfsBase64(list.map(a => a.base64));
    return [{ filename: mergedFilename(), content: mergedB64 }];
  }
  return list.map((a, i) => {
    if (filenameTemplate) {
      const base = processTemplate(filenameTemplate, { ...contextData, index: i + 1 }, `Attachment Filename ${i + 1}`);
      const safe = sanitizePdfFilename(base);
      if (list.length > 1 && !filenameTemplate.includes('{{index}}')) {
        return { filename: safe.replace(/\.pdf$/i, `-${i + 1}.pdf`), content: a.base64 };
      }
      return { filename: safe, content: a.base64 };
    }
    return { filename: sanitizePdfFilename(a.filename || `document-${i + 1}.pdf`), content: a.base64 };
  });
}

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

  if (config.cc) {
    const ccResult = processTemplateWithMapping(config.cc, contextData, 'Email CC');
    processedConfig.cc = ccResult.processed;
    Object.assign(allFieldMappings, ccResult.mappings);
  }

  if (config.bcc) {
    const bccResult = processTemplateWithMapping(config.bcc, contextData, 'Email BCC');
    processedConfig.bcc = bccResult.processed;
    Object.assign(allFieldMappings, bccResult.mappings);
  }

  const subjectResult = processTemplateWithMapping(config.subject, contextData, 'Email Subject');
  processedConfig.subject = subjectResult.processed;
  Object.assign(allFieldMappings, subjectResult.mappings);

  const bodyResult = processTemplateWithMapping(config.body, contextData, 'Email Body');
  processedConfig.body = formatBodyAsHtml(bodyResult.processed);
  Object.assign(allFieldMappings, bodyResult.mappings);

  if (config.from) {
    const fromResult = processTemplateWithMapping(config.from, contextData, 'Email From');
    processedConfig.from = fromResult.processed;
    Object.assign(allFieldMappings, fromResult.mappings);
  }

  let pdfAttachment: { filename: string; content: string } | Array<{ filename: string; content: string }> | null = null;
  const includeAttachment = config.includeAttachment !== false;
  const imagingAttachmentsAvailable = Array.isArray(contextData.imagingAttachments) && contextData.imagingAttachments.length > 0;
  console.log('📧 Attachment check - includeAttachment:', includeAttachment, '| attachmentSource config:', config.attachmentSource, '| pdfBase64 present:', !!contextData.pdfBase64, '| _lastBinaryResponseBase64 present:', !!contextData._lastBinaryResponseBase64, '| imagingAttachments count:', imagingAttachmentsAvailable ? contextData.imagingAttachments.length : 0);
  if (includeAttachment && (contextData.pdfBase64 || (config.attachmentSource === 'api_step_response' && contextData._lastBinaryResponseBase64) || (config.attachmentSource === 'imaging_document' && imagingAttachmentsAvailable))) {
    let attachmentFilename;
    const attachmentSource = config.attachmentSource || 'transform_setup_pdf';

    console.log('📧 Attachment source selected:', attachmentSource);

    if (attachmentSource === 'imaging_document') {
      const attachmentMode = config.attachmentMode || 'separate';
      const filenameTemplate = config.attachmentFilenameTemplate as string | undefined;
      const processTemplate = (t: string, c: any, name?: string) => processTemplateWithMapping(t, c, name || 'Attachment Filename').processed;
      const built = await buildImagingAttachments(contextData, attachmentMode, filenameTemplate, processTemplate);
      if (built.length > 0) {
        pdfAttachment = built.length === 1 ? built[0] : built;
        console.log(`📧 ✅ Using imaging document attachment(s) (mode=${attachmentMode}, count=${built.length}):`, built.map(b => b.filename).join(', '));
      } else {
        console.log('📧 ⚠️ attachmentSource=imaging_document but no attachments produced');
      }
    } else if (attachmentSource === 'api_step_response') {
      const base64Content = contextData._lastBinaryResponseBase64;
      if (base64Content) {
        attachmentFilename = config.attachmentFilenameTemplate || 'report.pdf';
        const templatePattern = /\{\{([^}]+)\}\}/g;
        attachmentFilename = attachmentFilename.replace(templatePattern, (match: string, path: string) => {
          const value = getValueByPath(contextData, path.trim());
          if (value !== undefined && value !== null) {
            return typeof value === 'object' ? JSON.stringify(value) : String(value);
          }
          return match;
        });
        console.log('📧 ✅ Using binary response from prior API step as attachment:', attachmentFilename);
        pdfAttachment = {
          filename: attachmentFilename,
          content: base64Content
        };
      } else {
        console.log('📧 ⚠️ attachmentSource=api_step_response but no _lastBinaryResponseBase64 in context');
      }
    } else if (attachmentSource === 'renamed_pdf_step' || attachmentSource === 'renamed_pdf') {
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

    if (attachmentSource !== 'api_step_response' && attachmentSource !== 'imaging_document') {
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
  }

  let currentUserEmail = null;
  if ((config.toCurrentUser || config.ccUser) && contextData.userId) {
    console.log('📧 Current user email needed, fetching for userId:', contextData.userId);
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
          currentUserEmail = users[0].email;
          console.log('📧 ✅ User email retrieved:', currentUserEmail);
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

  if (config.toCurrentUser && currentUserEmail) {
    console.log('📧 Overriding To with current user email:', currentUserEmail);
    processedConfig.to = currentUserEmail;
  }

  const ccEmail = processedConfig.cc || (config.ccUser ? currentUserEmail : null);
  const bccEmail = processedConfig.bcc || null;

  console.log('\n📧 === FINAL EMAIL DETAILS ===');
  console.log('To:', processedConfig.to);
  console.log('CC:', ccEmail || 'none');
  console.log('BCC:', bccEmail || 'none');
  console.log('Subject:', processedConfig.subject);
  console.log('From:', processedConfig.from || '(default)');
  const attachmentSummary = pdfAttachment
    ? (Array.isArray(pdfAttachment) ? pdfAttachment.map(a => a.filename).join(', ') : pdfAttachment.filename)
    : 'none';
  console.log('Attachment:', attachmentSummary);
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
      cc: ccEmail,
      bcc: bccEmail
    }, pdfAttachment);
  } else {
    emailResult = await sendGmailEmail(emailConfig.gmail!, {
      to: processedConfig.to,
      subject: processedConfig.subject,
      body: processedConfig.body,
      from: processedConfig.from || emailConfig.gmail!.default_send_from_email,
      cc: ccEmail,
      bcc: bccEmail
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
      cc: ccEmail,
      bcc: bccEmail
    },
    fieldMappings: allFieldMappings,
    attachmentIncluded: !!pdfAttachment,
    attachmentFilename: attachmentSummary === 'none' ? undefined : attachmentSummary
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

  let pdfAttachment: { filename: string; content: string } | Array<{ filename: string; content: string }> | null = null;
  const shouldAttachPdf = config.includeAttachment !== undefined ? config.includeAttachment : template.attach_pdf;

  if (shouldAttachPdf) {
    const attachmentSource = config.attachmentSource || 'transform_setup_pdf';
    const imagingAttachmentsAvailable = Array.isArray(contextData.imagingAttachments) && contextData.imagingAttachments.length > 0;
    console.log('📧 Notification template attachment source:', attachmentSource, '| _lastBinaryResponseBase64 present:', !!contextData._lastBinaryResponseBase64, '| imagingAttachments:', imagingAttachmentsAvailable ? contextData.imagingAttachments.length : 0);

    if (attachmentSource === 'imaging_document' && imagingAttachmentsAvailable) {
      const attachmentMode = config.attachmentMode || 'separate';
      const filenameTemplate = config.attachmentFilenameTemplate as string | undefined;
      const built = await buildImagingAttachments(
        contextData,
        attachmentMode,
        filenameTemplate,
        (t, c) => processTemplateVariables(t, c)
      );
      if (built.length > 0) {
        pdfAttachment = built.length === 1 ? built[0] : built;
        console.log(`📧 ✅ Notification template: using imaging attachment(s) (mode=${attachmentMode}, count=${built.length})`);
      } else {
        console.log('📧 ⚠️ Notification template: imaging_document selected but nothing produced');
      }
    } else if (attachmentSource === 'api_step_response' && contextData._lastBinaryResponseBase64) {
      let attachmentFilename = config.attachmentFilenameTemplate || 'report.pdf';
      const templatePattern = /\{\{([^}]+)\}\}/g;
      attachmentFilename = attachmentFilename.replace(templatePattern, (match: string, path: string) => {
        const value = getValueByPath(contextData, path.trim());
        if (value !== undefined && value !== null) {
          return typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
        return match;
      });
      pdfAttachment = {
        filename: attachmentFilename,
        content: contextData._lastBinaryResponseBase64
      };
      console.log('📧 ✅ Notification template: using binary response from API step as attachment:', attachmentFilename);
    } else if (contextData.pdfBase64) {
      const attachmentFilename = contextData.pdfFilename || contextData.originalPdfFilename || 'attachment.pdf';
      pdfAttachment = {
        filename: attachmentFilename,
        content: contextData.pdfBase64
      };
      console.log('📧 ✅ Notification template: PDF attachment prepared:', attachmentFilename);
    } else {
      console.log('📧 ⚠️ Notification template: shouldAttachPdf=true but no attachment data available');
    }
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
      cc: template.cc_emails ? processTemplateVariables(template.cc_emails, notificationContext) : undefined,
      bcc: template.bcc_emails ? processTemplateVariables(template.bcc_emails, notificationContext) : undefined
    }, pdfAttachment);
  } else {
    emailResult = await sendGmailEmail(emailConfig.gmail!, {
      to: processedRecipient,
      subject: processedSubject,
      body: htmlBody,
      from: emailConfig.gmail!.default_send_from_email,
      cc: template.cc_emails ? processTemplateVariables(template.cc_emails, notificationContext) : undefined,
      bcc: template.bcc_emails ? processTemplateVariables(template.bcc_emails, notificationContext) : undefined
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
    attachmentFilename: pdfAttachment
      ? (Array.isArray(pdfAttachment) ? pdfAttachment.map(a => a.filename).join(', ') : pdfAttachment.filename)
      : undefined
  };
}
