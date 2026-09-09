import { getValueByPath } from "../utils.ts";
import { sendOffice365Email, sendGmailEmail, extractSpecificPageFromPdf } from "./emailProviders.ts";

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

export async function executeEmailAction(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<any> {
  console.log('📧 === EXECUTING EMAIL ACTION STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Email config:', JSON.stringify(config, null, 2));

  const processTemplateWithMapping = (template: string, ctxData: any, templateName = 'template') => {
    const mappings: Record<string, any> = {};
    if (!template || !template.includes('{{')) {
      return { processed: template, mappings };
    }
    const templatePattern = /\{\{([^}]+)\}\}/g;
    const processed = template.replace(templatePattern, (match: string, path: string) => {
      const trimmedPath = path.trim();
      const value = getValueByPath(ctxData, trimmedPath);
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

  let pdfAttachment: { filename: string; content: string } | null = null;
  const includeAttachment = config.includeAttachment !== false;
  console.log('📧 Attachment check - includeAttachment:', includeAttachment, '| attachmentSource config:', config.attachmentSource, '| pdfBase64 present:', !!contextData.pdfBase64, '| _lastBinaryResponseBase64 present:', !!contextData._lastBinaryResponseBase64, '| _lastBinaryResponseBase64 length:', contextData._lastBinaryResponseBase64?.length || 0);
  if (includeAttachment && (contextData.pdfBase64 || (config.attachmentSource === 'api_step_response' && contextData._lastBinaryResponseBase64))) {
    let attachmentFilename;
    const attachmentSource = config.attachmentSource || 'transform_setup_pdf';
    console.log('📧 Attachment source selected:', attachmentSource);

    if (attachmentSource === 'api_step_response') {
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

    if (attachmentSource !== 'api_step_response') {
      let pdfContent = contextData.pdfBase64;
      const pdfEmailStrategy = config.pdfEmailStrategy || 'all_pages_in_group';
      if (pdfEmailStrategy === 'specific_page_in_group' && config.specificPageToEmail) {
        const pageToEmail = config.specificPageToEmail;
        console.log(`📧 Extracting page ${pageToEmail} from PDF for email attachment`);
        try {
          pdfContent = await extractSpecificPageFromPdf(contextData.pdfBase64, pageToEmail);
          console.log(`📧 ✅ Successfully extracted page ${pageToEmail} from PDF`);
        } catch (extractError: any) {
          console.error(`📧 ❌ Failed to extract page ${pageToEmail}:`, extractError);
          throw new Error(`Failed to extract page ${pageToEmail} from PDF: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
        }
      } else {
        console.log('📧 Using full PDF (all pages in group) for email attachment');
      }

      pdfAttachment = { filename: attachmentFilename, content: pdfContent };
      console.log('📧 PDF attachment prepared with filename:', attachmentFilename);
    }
  }

  let currentUserEmail: string | null = null;
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

  const ccEmail: string | null = processedConfig.cc || (config.ccUser ? currentUserEmail : null);
  const bccEmail: string | null = processedConfig.bcc || null;

  console.log('\n📧 === FINAL EMAIL DETAILS ===');
  console.log('To:', processedConfig.to);
  console.log('CC:', ccEmail || 'none');
  console.log('BCC:', bccEmail || 'none');
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
  const emailConfig: any = {
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
    emailResult = await sendOffice365Email(emailConfig.office365, {
      to: processedConfig.to,
      subject: processedConfig.subject,
      body: processedConfig.body,
      from: processedConfig.from || emailConfig.office365.default_send_from_email,
      cc: ccEmail,
      bcc: bccEmail
    }, pdfAttachment);
  } else {
    emailResult = await sendGmailEmail(emailConfig.gmail, {
      to: processedConfig.to,
      subject: processedConfig.subject,
      body: processedConfig.body,
      from: processedConfig.from || emailConfig.gmail.default_send_from_email,
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
    processedConfig,
    fieldMappings: allFieldMappings,
    attachmentIncluded: !!pdfAttachment,
    attachmentFilename: pdfAttachment?.filename
  };
}
