import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  storagePath: string;
  fileName: string;
  recipients: string[];
  subject: string;
  submissionDocumentId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { storagePath, fileName, recipients, subject, submissionDocumentId }: RequestBody = await req.json();

    console.log("[send-order-entry-document-email] Request received:", {
      storagePath,
      fileName,
      recipientCount: recipients?.length,
      subject,
      submissionDocumentId,
      userId: user.id,
    });

    if (!storagePath || !recipients || recipients.length === 0) {
      console.error("[send-order-entry-document-email] Missing required fields");
      return new Response(
        JSON.stringify({ success: false, message: "Missing required fields: storagePath, recipients" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecipients = recipients.filter((r) => emailRegex.test(r.trim()));
    if (validRecipients.length === 0) {
      console.error("[send-order-entry-document-email] No valid email recipients:", recipients);
      return new Response(
        JSON.stringify({ success: false, message: "No valid email addresses provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[send-order-entry-document-email] Downloading file from storage:", storagePath);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("order-entry-documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("[send-order-entry-document-email] Storage download failed:", downloadError);
      if (submissionDocumentId) {
        await supabase.from("order_entry_submission_documents").update({
          action_status: "failed",
          action_error: `Storage download failed: ${downloadError?.message || "File not found"}`,
        }).eq("id", submissionDocumentId);
      }
      return new Response(
        JSON.stringify({ success: false, message: `Failed to download file: ${downloadError?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const documentBuffer = await fileData.arrayBuffer();
    console.log("[send-order-entry-document-email] File downloaded, size:", documentBuffer.byteLength);

    const { data: emailConfigs, error: configError } = await supabase
      .from("email_monitoring_config")
      .select("*");

    if (configError || !emailConfigs || emailConfigs.length === 0) {
      const errMsg = "No email configuration found. Please configure email settings in admin.";
      console.error("[send-order-entry-document-email]", errMsg, configError);
      if (submissionDocumentId) {
        await supabase.from("order_entry_submission_documents").update({
          action_status: "failed",
          action_error: errMsg,
        }).eq("id", submissionDocumentId);
      }
      return new Response(
        JSON.stringify({ success: false, message: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailConfig = emailConfigs[0];
    console.log("[send-order-entry-document-email] Email provider:", emailConfig.provider);
    console.log("[send-order-entry-document-email] Send from:", emailConfig.default_send_from_email);

    const attachmentFilename = fileName || "document.pdf";
    const ext = attachmentFilename.split(".").pop()?.toLowerCase() || "pdf";
    let contentType = "application/octet-stream";
    if (ext === "pdf") contentType = "application/pdf";
    else if (ext === "png") contentType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "tif" || ext === "tiff") contentType = "image/tiff";

    const emailSubject = subject || `Document: ${attachmentFilename}`;
    const emailBody = getEmailHtml(attachmentFilename);

    console.log("[send-order-entry-document-email] Sending email...", {
      to: validRecipients,
      subject: emailSubject,
      attachmentFilename,
      contentType,
      provider: emailConfig.provider,
    });

    if (emailConfig.provider === "office365") {
      await sendOffice365Email(
        emailConfig, validRecipients, emailSubject, emailBody,
        documentBuffer, attachmentFilename, contentType
      );
    } else if (emailConfig.provider === "gmail") {
      await sendGmailEmail(
        emailConfig, validRecipients, emailSubject, emailBody,
        documentBuffer, attachmentFilename, contentType
      );
    } else {
      const errMsg = `Unsupported email provider: ${emailConfig.provider}`;
      console.error("[send-order-entry-document-email]", errMsg);
      if (submissionDocumentId) {
        await supabase.from("order_entry_submission_documents").update({
          action_status: "failed",
          action_error: errMsg,
        }).eq("id", submissionDocumentId);
      }
      return new Response(
        JSON.stringify({ success: false, message: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-order-entry-document-email] Email sent successfully!");

    if (submissionDocumentId) {
      await supabase.from("order_entry_submission_documents").update({
        action_status: "sent",
        action_error: null,
      }).eq("id", submissionDocumentId);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-order-entry-document-email] Unhandled error:", error.message, error.stack);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  return btoa(chunks.join(""));
}

function getEmailHtml(documentName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">Order Entry Document</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 15px 0;">Please find the attached document: <strong>${documentName}</strong></p>
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:20px 0 0 0;">This document was submitted via the Order Entry portal.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendOffice365Email(
  emailConfig: any, recipients: string[], subject: string, body: string,
  attachmentData: ArrayBuffer, attachmentFilename: string, attachmentContentType: string
) {
  console.log("[send-order-entry-document-email] Getting Office 365 token...");
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
    const errText = await tokenResponse.text().catch(() => "");
    console.error("[send-order-entry-document-email] Office 365 token error:", tokenResponse.status, errText);
    throw new Error(`Failed to get Office 365 access token: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json();

  const toRecipients = recipients.map((email) => ({
    emailAddress: { address: email.trim() },
  }));

  const attachmentBase64 = uint8ArrayToBase64(new Uint8Array(attachmentData));

  console.log("[send-order-entry-document-email] Sending via Graph API from:", emailConfig.default_send_from_email);
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
          subject,
          body: { contentType: "HTML", content: body },
          toRecipients,
          attachments: [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: attachmentFilename,
            contentType: attachmentContentType,
            contentBytes: attachmentBase64,
          }],
        },
        saveToSentItems: false,
      }),
    }
  );

  if (!sendEmailResponse.ok) {
    const errText = await sendEmailResponse.text();
    console.error("[send-order-entry-document-email] Graph API send error:", sendEmailResponse.status, errText);
    throw new Error(`Failed to send email via Office 365: ${sendEmailResponse.status} ${errText}`);
  }
}

async function sendGmailEmail(
  emailConfig: any, recipients: string[], subject: string, body: string,
  attachmentData: ArrayBuffer, attachmentFilename: string, attachmentContentType: string
) {
  console.log("[send-order-entry-document-email] Getting Gmail token...");
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
    const errText = await tokenResponse.text().catch(() => "");
    console.error("[send-order-entry-document-email] Gmail token error:", tokenResponse.status, errText);
    throw new Error(`Failed to get Gmail access token: ${tokenResponse.status}`);
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

  console.log("[send-order-entry-document-email] Sending via Gmail API...");
  const sendEmailResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedEmail }),
    }
  );

  if (!sendEmailResponse.ok) {
    const errText = await sendEmailResponse.text();
    console.error("[send-order-entry-document-email] Gmail send error:", sendEmailResponse.status, errText);
    throw new Error(`Failed to send email via Gmail: ${sendEmailResponse.status} ${errText}`);
  }
}
