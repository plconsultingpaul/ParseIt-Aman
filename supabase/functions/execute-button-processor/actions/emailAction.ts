import { getValueByPath, replaceVariables } from "../utils/objectPaths.ts";

function parseBase64Item(base64Data: string, filenameTemplate: string, contextData: any, index?: number): { contentBytes: string; name: string; contentType: string } {
  let contentType = 'application/pdf';
  let data = base64Data;
  if (data.startsWith('data:')) {
    const semicolonIndex = data.indexOf(';');
    if (semicolonIndex !== -1) {
      contentType = data.substring(5, semicolonIndex);
    }
    const commaIndex = data.indexOf(',');
    if (commaIndex !== -1) {
      data = data.substring(commaIndex + 1);
    }
  }

  const defaultFilename = contentType.startsWith('image/')
    ? `photo${index !== undefined ? `_${index + 1}` : ''}.${contentType === 'image/png' ? 'png' : 'jpg'}`
    : `attachment${index !== undefined ? `_${index + 1}` : ''}.pdf`;
  let filename = replaceVariables(filenameTemplate || defaultFilename, contextData);
  if (index !== undefined && filenameTemplate) {
    const dotIdx = filename.lastIndexOf('.');
    if (dotIdx > 0) {
      filename = `${filename.substring(0, dotIdx)}_${index + 1}${filename.substring(dotIdx)}`;
    } else {
      filename = `${filename}_${index + 1}`;
    }
  }

  return { contentBytes: data, name: filename, contentType };
}

function resolveBase64Attachments(config: any, contextData: any): { contentBytes: string; name: string; contentType: string }[] {
  if (!config.includeAttachment || config.attachmentSource !== 'variable_base64') {
    return [];
  }

  const variablePath = config.attachmentBase64Variable || '';
  if (!variablePath) {
    console.warn('Attachment configured but no variable path specified');
    return [];
  }

  const rawValue = getValueByPath(contextData.response, variablePath)
    ?? getValueByPath(contextData.execute, variablePath)
    ?? getValueByPath(contextData, variablePath);

  if (!rawValue) {
    console.warn(`No data found at variable path: ${variablePath}`);
    return [];
  }

  const filenameTemplate = config.attachmentFilename || '';

  if (Array.isArray(rawValue)) {
    const attachments: { contentBytes: string; name: string; contentType: string }[] = [];
    for (let i = 0; i < rawValue.length; i++) {
      const item = rawValue[i];
      const imageData = typeof item === 'string' ? item : item?.imageData;
      if (imageData && typeof imageData === 'string') {
        attachments.push(parseBase64Item(imageData, filenameTemplate, contextData, i));
      }
    }
    console.log(`Resolved ${attachments.length} attachments from array at: ${variablePath}`);
    return attachments;
  }

  if (typeof rawValue === 'string') {
    if (variablePath.endsWith('.imageData')) {
      const parentPath = variablePath.substring(0, variablePath.lastIndexOf('.imageData'));
      const parentObj = getValueByPath(contextData.response, parentPath)
        ?? getValueByPath(contextData.execute, parentPath)
        ?? getValueByPath(contextData, parentPath);
      if (parentObj && Array.isArray(parentObj.images) && parentObj.images.length > 1) {
        const attachments: { contentBytes: string; name: string; contentType: string }[] = [];
        for (let i = 0; i < parentObj.images.length; i++) {
          const item = parentObj.images[i];
          const imageData = typeof item === 'string' ? item : item?.imageData;
          if (imageData && typeof imageData === 'string') {
            attachments.push(parseBase64Item(imageData, filenameTemplate, contextData, i));
          }
        }
        console.log(`Resolved ${attachments.length} attachments from multi-photo parent at: ${parentPath}`);
        return attachments;
      }
    }
    return [parseBase64Item(rawValue, filenameTemplate, contextData)];
  }

  if (typeof rawValue === 'object' && rawValue !== null && Array.isArray(rawValue.images)) {
    const attachments: { contentBytes: string; name: string; contentType: string }[] = [];
    for (let i = 0; i < rawValue.images.length; i++) {
      const item = rawValue.images[i];
      const imageData = typeof item === 'string' ? item : item?.imageData;
      if (imageData && typeof imageData === 'string') {
        attachments.push(parseBase64Item(imageData, filenameTemplate, contextData, i));
      }
    }
    console.log(`Resolved ${attachments.length} attachments from images object at: ${variablePath}`);
    return attachments;
  }

  console.warn(`Unsupported data type at variable path: ${variablePath}`);
  return [];
}

export async function executeEmailAction(step: any, contextData: any, supabaseUrl: string, supabaseServiceKey: string): Promise<any> {
  console.log('\uD83D\uDCE7 Executing Email Action step:', step.step_name);
  const config = step.config_json || {};

  const to = replaceVariables(config.to || '', contextData);
  const cc = replaceVariables(config.cc || '', contextData);
  const bcc = replaceVariables(config.bcc || '', contextData);
  const subject = replaceVariables(config.subject || '', contextData);
  const body = replaceVariables(config.body || '', contextData);
  const from = config.from ? replaceVariables(config.from, contextData) : undefined;

  const splitAddresses = (raw: string) => raw
    .split(/[,;]/)
    .map(a => a.trim())
    .filter(a => a.length > 0);

  const toAddresses = splitAddresses(to);
  const ccAddresses = splitAddresses(cc);
  const bccAddresses = splitAddresses(bcc);

  const attachments = resolveBase64Attachments(config, contextData);

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

  const emailConfigs = await emailConfigResponse.json();
  if (!emailConfigs?.length) {
    throw new Error('Email configuration not found');
  }

  const emailConfig = emailConfigs[0];

  if (emailConfig.provider === 'office365') {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${emailConfig.tenant_id}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: emailConfig.client_id,
        client_secret: emailConfig.client_secret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Office365 access token');
    }

    const tokenData = await tokenResponse.json();
    const sendFrom = from || emailConfig.default_send_from_email;

    const emailPayload: any = {
      message: {
        subject,
        body: { contentType: 'HTML', content: body.replace(/\n/g, '<br>') },
        toRecipients: toAddresses.map(addr => ({ emailAddress: { address: addr } }))
      },
      saveToSentItems: true
    };

    if (ccAddresses.length > 0) {
      emailPayload.message.ccRecipients = ccAddresses.map(addr => ({ emailAddress: { address: addr } }));
    }

    if (bccAddresses.length > 0) {
      emailPayload.message.bccRecipients = bccAddresses.map(addr => ({ emailAddress: { address: addr } }));
    }

    if (attachments.length > 0) {
      emailPayload.message.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes
      }));
      console.log(`Attaching ${attachments.length} file(s): ${attachments.map(a => a.name).join(', ')}`);
    }

    const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${sendFrom}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return { success: true, to: toAddresses, cc: ccAddresses, bcc: bccAddresses, subject, hasAttachment: attachments.length > 0, attachmentCount: attachments.length, attachmentNames: attachments.map(a => a.name) };
  }

  throw new Error(`Unsupported email provider: ${emailConfig.provider}`);
}
