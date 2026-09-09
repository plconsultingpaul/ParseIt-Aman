// steps/emailProviders.ts - Office365 and Gmail email provider implementations

export async function extractSpecificPageFromPdf(pdfBase64: string, pageNumber: number): Promise<string> {
  console.log(`📄 === EXTRACTING PAGE ${pageNumber} FROM PDF ===`);

  try {
    const { PDFDocument } = await import('npm:pdf-lib@1.17.1');

    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    console.log(`📄 Decoded PDF, size: ${pdfBytes.length} bytes`);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    console.log(`📄 PDF has ${totalPages} page(s)`);

    if (pageNumber < 1 || pageNumber > totalPages) {
      throw new Error(
        `Invalid page number ${pageNumber}. PDF has ${totalPages} page(s). Page number must be between 1 and ${totalPages}.`
      );
    }

    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNumber - 1]);
    newPdf.addPage(copiedPage);

    const newPdfBytes = await newPdf.save();
    console.log(`📄 Created new PDF with single page, size: ${newPdfBytes.length} bytes`);

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < newPdfBytes.length; i += chunkSize) {
      const chunk = newPdfBytes.subarray(i, Math.min(i + chunkSize, newPdfBytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    const newPdfBase64 = btoa(binary);
    console.log(`📄 ✅ Successfully extracted page ${pageNumber}/${totalPages}`);

    return newPdfBase64;
  } catch (error) {
    console.error('📄 ❌ PDF extraction failed:', error);
    throw error;
  }
}

export async function getOffice365AccessToken(config: { tenant_id: string; client_id: string; client_secret: string }): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Office365 access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function sendOffice365Email(
  config: { tenant_id: string; client_id: string; client_secret: string; default_send_from_email: string },
  email: { to: string; subject: string; body: string; from: string; cc?: string | null },
  attachment: { filename: string; content: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getOffice365AccessToken(config);

    const message: any = {
      message: {
        subject: email.subject,
        body: {
          contentType: 'HTML',
          content: email.body
        },
        toRecipients: [
          {
            emailAddress: {
              address: email.to
            }
          }
        ],
        from: {
          emailAddress: {
            address: email.from
          }
        },
        ...(email.cc ? {
          ccRecipients: [
            {
              emailAddress: {
                address: email.cc
              }
            }
          ]
        } : {})
      },
      saveToSentItems: 'true'
    };

    if (attachment) {
      message.message.attachments = [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.filename,
          contentType: 'application/pdf',
          contentBytes: attachment.content
        }
      ];
    }

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${email.from}/sendMail`;

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getGmailAccessToken(config: { client_id: string; client_secret: string; refresh_token: string }): Promise<string> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const params = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    refresh_token: config.refresh_token,
    grant_type: 'refresh_token'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Gmail access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function sendGmailEmail(
  config: { client_id: string; client_secret: string; refresh_token: string; default_send_from_email: string },
  email: { to: string; subject: string; body: string; from: string; cc?: string | null },
  attachment: { filename: string; content: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getGmailAccessToken(config);

    let emailContent;

    if (attachment) {
      const boundary = '----=_Part_' + Date.now();
      const emailLines = [
        `To: ${email.to}`,
        ...(email.cc ? [`Cc: ${email.cc}`] : []),
        `From: ${email.from}`,
        `Subject: ${email.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        '',
        email.body,
        '',
        `--${boundary}`,
        `Content-Type: application/pdf; name="${attachment.filename}"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        attachment.content,
        '',
        `--${boundary}--`
      ];
      emailContent = emailLines.join('\r\n');
    } else {
      emailContent = [
        `From: ${email.from}`,
        `To: ${email.to}`,
        ...(email.cc ? [`Cc: ${email.cc}`] : []),
        `Subject: ${email.subject}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        email.body
      ].join('\r\n');
    }

    const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedEmail })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
