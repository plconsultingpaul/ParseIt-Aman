import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  documentUrl: string;
  documentName: string;
  recipients: string[];
  subject?: string;
  message?: string;
}

async function verifyAuthenticated(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  return btoa(chunks.join(""));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    await verifyAuthenticated(req);

    const {
      documentUrl,
      documentName,
      recipients,
      subject,
      message,
    }: RequestBody = await req.json();

    if (!documentUrl || !recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing required fields: documentUrl and recipients",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecipients = recipients.filter((r) => emailRegex.test(r));
    if (validRecipients.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No valid email addresses provided",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: emailConfigs, error: configError } = await supabase
      .from("email_monitoring_config")
      .select("*");

    if (configError || !emailConfigs || emailConfigs.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "No email configuration found. Please configure email settings in Settings.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailConfig = emailConfigs[0];

    const docResponse = await fetch(documentUrl);
    if (!docResponse.ok) {
      throw new Error(
        `Failed to fetch document: ${docResponse.status} ${docResponse.statusText}`
      );
    }

    const contentType =
      docResponse.headers.get("content-type") || "application/octet-stream";
    const documentBuffer = await docResponse.arrayBuffer();
    const attachmentFilename = documentName || "document";

    const companyName = await loadCompanyName(supabase);
    const safeDocName = documentName || "document";

    const emailSubject =
      subject || `Document: ${safeDocName}`;

    const emailBody = message
      ? buildEmailHtml(safeDocName, companyName, message)
      : buildEmailHtml(safeDocName, companyName);

    if (emailConfig.provider === "office365") {
      await sendOffice365Email(
        emailConfig,
        validRecipients,
        emailSubject,
        emailBody,
        documentBuffer,
        attachmentFilename,
        contentType
      );
    } else if (emailConfig.provider === "gmail") {
      await sendGmailEmail(
        emailConfig,
        validRecipients,
        emailSubject,
        emailBody,
        documentBuffer,
        attachmentFilename,
        contentType
      );
    } else {
      throw new Error("Unsupported email provider: " + emailConfig.provider);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent to ${validRecipients.join(", ")}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return new Response(
        JSON.stringify({ success: false, message: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to send email",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function loadCompanyName(supabase: any): Promise<string> {
  try {
    const { data: branding } = await supabase
      .from("company_branding")
      .select("company_name")
      .limit(1);

    if (branding && branding.length > 0 && branding[0].company_name) {
      return branding[0].company_name;
    }
  } catch (error) {
    console.error("Error loading company name:", error);
  }
  return "Document Portal";
}

function buildEmailHtml(
  documentName: string,
  companyName: string,
  customMessage?: string
): string {
  const messageBlock = customMessage
    ? `<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; white-space: pre-wrap;">${escapeHtml(customMessage)}</p>`
    : `<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Please find the attached document: <strong>${escapeHtml(documentName)}</strong></p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">
                ${escapeHtml(documentName)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hello,</p>
              ${messageBlock}
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                The document is attached to this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">${escapeHtml(companyName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendOffice365Email(
  emailConfig: any,
  recipients: string[],
  subject: string,
  body: string,
  attachmentData: ArrayBuffer,
  attachmentFilename: string,
  attachmentContentType: string
) {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${emailConfig.tenant_id}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: emailConfig.client_id,
        client_secret: emailConfig.client_secret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!tokenResponse.ok) {
    throw new Error("Failed to get Office 365 access token");
  }

  const { access_token } = await tokenResponse.json();

  const toRecipients = recipients.map((email) => ({
    emailAddress: { address: email },
  }));

  const attachmentBase64 = uint8ArrayToBase64(new Uint8Array(attachmentData));

  const sendEmailResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${emailConfig.default_send_from_email}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: body,
          },
          toRecipients: toRecipients,
          attachments: [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachmentFilename,
              contentType: attachmentContentType,
              contentBytes: attachmentBase64,
            },
          ],
        },
        saveToSentItems: false,
      }),
    }
  );

  if (!sendEmailResponse.ok) {
    const error = await sendEmailResponse.text();
    throw new Error(`Failed to send email via Office 365: ${error}`);
  }
}

async function sendGmailEmail(
  emailConfig: any,
  recipients: string[],
  subject: string,
  body: string,
  attachmentData: ArrayBuffer,
  attachmentFilename: string,
  attachmentContentType: string
) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: emailConfig.gmail_client_id,
      client_secret: emailConfig.gmail_client_secret,
      refresh_token: emailConfig.gmail_refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Failed to get Gmail access token");
  }

  const { access_token } = await tokenResponse.json();

  const attachmentBase64 = uint8ArrayToBase64(new Uint8Array(attachmentData));

  const boundary = "boundary_" + Date.now();
  const rawEmail = [
    `From: ${emailConfig.default_send_from_email}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    body,
    "",
    `--${boundary}`,
    `Content-Type: ${attachmentContentType}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentFilename}"`,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sendEmailResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedEmail,
      }),
    }
  );

  if (!sendEmailResponse.ok) {
    const error = await sendEmailResponse.text();
    throw new Error(`Failed to send email via Gmail: ${error}`);
  }
}
