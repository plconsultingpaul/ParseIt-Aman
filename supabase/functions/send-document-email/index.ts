import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import UTIF from "npm:utif2@4.1.0";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  documentConfigId: string;
  documentId: string;
  documentName: string;
  recipients: string[];
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
      documentConfigId,
      documentId,
      documentName,
      recipients,
    }: RequestBody = await req.json();

    if (!documentConfigId || !documentId || !recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Missing required fields: documentConfigId, documentId, and recipients",
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

    const { data: docConfig, error: docConfigError } = await supabase
      .from("track_trace_document_configs")
      .select("*")
      .eq("id", documentConfigId)
      .maybeSingle();

    if (docConfigError || !docConfig) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Document configuration not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!docConfig.email_enabled) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Email is not enabled for this document configuration",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!docConfig.get_document_api_url) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Document configuration has no API URL template",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const docIdField = docConfig.doc_id_field || "docId";
    const docIdPattern = new RegExp(
      `\\{\\{${docIdField}\\}\\}`,
      "g"
    );
    const documentUrl = docConfig.get_document_api_url.replace(
      docIdPattern,
      documentId
    );

    let authToken = "";
    let authType = "bearer";
    if (docConfig.auth_config_id) {
      const { data: authConfig } = await supabase
        .from("api_auth_config")
        .select("*")
        .eq("id", docConfig.auth_config_id)
        .maybeSingle();

      if (authConfig) {
        authToken = await getAuthToken(authConfig);
        authType = authConfig.auth_type || "bearer";
      }
    }

    const docHeaders: Record<string, string> = {};
    if (authToken) {
      if (authType === "bearer") {
        docHeaders["Authorization"] = `Bearer ${authToken}`;
      } else if (authType === "apikey") {
        docHeaders["Authorization"] = authToken;
      }
    }

    const docResponse = await fetch(documentUrl, { headers: docHeaders });

    if (!docResponse.ok) {
      throw new Error(
        `Failed to fetch document: ${docResponse.status} ${docResponse.statusText}`
      );
    }

    const contentType =
      docResponse.headers.get("content-type") || "application/octet-stream";
    let documentBuffer = await docResponse.arrayBuffer();
    let attachmentContentType = contentType;
    let attachmentFilename = documentName || "document";

    const isTiff =
      contentType.toLowerCase().includes("tiff") ||
      contentType.toLowerCase().includes("tif") ||
      attachmentFilename.toLowerCase().endsWith(".tiff") ||
      attachmentFilename.toLowerCase().endsWith(".tif");

    if (isTiff) {
      let convertedToPdf = false;
      try {
        const tiffData = new Uint8Array(documentBuffer);
        const dimensions = getTiffDimensions(tiffData);

        if (dimensions) {
          const pixelCount = dimensions.width * dimensions.height;
          const MAX_SAFE_PIXELS = 1500 * 1500;

          if (pixelCount <= MAX_SAFE_PIXELS) {
            const pdfBytes = await convertTiffToPdf(tiffData);
            documentBuffer = pdfBytes.buffer;
            attachmentContentType = "application/pdf";
            attachmentFilename = attachmentFilename.replace(
              /\.(tiff?|TIFF?)$/i,
              ".pdf"
            );
            if (!attachmentFilename.toLowerCase().endsWith(".pdf")) {
              attachmentFilename += ".pdf";
            }
            convertedToPdf = true;
          }
        }
      } catch (conversionError) {
        console.error("TIFF to PDF conversion failed:", conversionError);
      }

      if (!convertedToPdf) {
        attachmentContentType = "image/tiff";
        if (
          !attachmentFilename.toLowerCase().endsWith(".tiff") &&
          !attachmentFilename.toLowerCase().endsWith(".tif")
        ) {
          attachmentFilename += ".tiff";
        }
      }
    }

    const { data: emailConfigs, error: configError } = await supabase
      .from("email_monitoring_config")
      .select("*");

    if (configError || !emailConfigs || emailConfigs.length === 0) {
      throw new Error(
        "No email configuration found. Please configure email settings."
      );
    }

    const emailConfig = emailConfigs[0];
    const companyName = await loadCompanyName(supabase);

    const safeDocName = documentName || "document";
    const subject = replaceTemplateVariables(
      docConfig.email_subject || "Document: {{document_name}}",
      {
        document_name: safeDocName,
        company_name: companyName,
      }
    );

    const body = replaceTemplateVariables(
      docConfig.email_template || getDefaultEmailHtml(),
      {
        document_name: safeDocName,
        company_name: companyName,
      }
    );

    if (emailConfig.provider === "office365") {
      await sendOffice365Email(
        emailConfig,
        validRecipients,
        subject,
        body,
        documentBuffer,
        attachmentFilename,
        attachmentContentType
      );
    } else if (emailConfig.provider === "gmail") {
      await sendGmailEmail(
        emailConfig,
        validRecipients,
        subject,
        body,
        documentBuffer,
        attachmentFilename,
        attachmentContentType
      );
    } else {
      throw new Error("Unsupported email provider: " + emailConfig.provider);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
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

async function getAuthToken(authConfig: any): Promise<string> {
  if (
    authConfig.login_endpoint &&
    authConfig.username &&
    authConfig.password
  ) {
    const loginResponse = await fetch(authConfig.login_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: authConfig.username,
        password: authConfig.password,
      }),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text().catch(() => "");
      throw new Error(
        `Authentication failed: ${loginResponse.status} ${errorText}`
      );
    }

    const loginData = await loginResponse.json();
    const tokenFieldName = authConfig.token_field_name || "access_token";
    const token = loginData[tokenFieldName];

    if (!token) {
      throw new Error(`Login response missing '${tokenFieldName}' field`);
    }

    return token;
  } else if (authConfig.auth_type === "oauth2" && authConfig.token_url) {
    const tokenResponse = await fetch(authConfig.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: authConfig.client_id,
        client_secret: authConfig.client_secret,
        grant_type: "client_credentials",
        scope: authConfig.scope || "",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to get OAuth2 access token");
    }

    const tokenData = await tokenResponse.json();
    const tokenFieldName = authConfig.token_field_name || "access_token";
    return tokenData[tokenFieldName];
  } else if (authConfig.auth_type === "apikey") {
    return authConfig.api_key || "";
  } else if (authConfig.auth_type === "bearer") {
    return authConfig.bearer_token || "";
  }
  return "";
}

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

function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

function getDefaultEmailHtml(): string {
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
            <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">
                {{document_name}}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hello,
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Please find the attached document: <strong>{{document_name}}</strong>
              </p>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                This document was shared with you from the shipment tracking system.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                {{company_name}}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getTiffDimensions(
  tiffData: Uint8Array
): { width: number; height: number } | null {
  try {
    const ifds = UTIF.decode(tiffData);
    if (ifds && ifds.length > 0) {
      const width = ifds[0].width || ifds[0].t256?.[0] || 0;
      const height = ifds[0].height || ifds[0].t257?.[0] || 0;
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
  } catch (e) {
    console.error("Error reading TIFF dimensions:", e);
  }
  return null;
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

async function convertTiffToPdf(tiffData: Uint8Array): Promise<Uint8Array> {
  const ifds = UTIF.decode(tiffData);
  if (!ifds || ifds.length === 0) {
    throw new Error("No images found in TIFF file");
  }

  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < ifds.length; i++) {
    const ifd = ifds[i];
    UTIF.decodeImage(tiffData, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const width = ifd.width;
    const height = ifd.height;

    const pngData = await encodePng(rgba, width, height);
    const pngImage = await pdfDoc.embedPng(pngData);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });
  }

  return await pdfDoc.save();
}

async function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint32BE(
    arr: Uint8Array,
    offset: number,
    value: number
  ): void {
    arr[offset] = (value >> 24) & 0xff;
    arr[offset + 1] = (value >> 16) & 0xff;
    arr[offset + 2] = (value >> 8) & 0xff;
    arr[offset + 3] = value & 0xff;
  }

  function createChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    writeUint32BE(chunk, 0, data.length);
    chunk[4] = type.charCodeAt(0);
    chunk[5] = type.charCodeAt(1);
    chunk[6] = type.charCodeAt(2);
    chunk[7] = type.charCodeAt(3);
    chunk.set(data, 8);
    const crcData = new Uint8Array(4 + data.length);
    crcData[0] = type.charCodeAt(0);
    crcData[1] = type.charCodeAt(1);
    crcData[2] = type.charCodeAt(2);
    crcData[3] = type.charCodeAt(3);
    crcData.set(data, 4);
    writeUint32BE(chunk, 8 + data.length, crc32(crcData));
    return chunk;
  }

  const ihdrData = new Uint8Array(13);
  writeUint32BE(ihdrData, 0, width);
  writeUint32BE(ihdrData, 4, height);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = createChunk("IHDR", ihdrData);

  const rawData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgba[srcIdx];
      rawData[dstIdx + 1] = rgba[srcIdx + 1];
      rawData[dstIdx + 2] = rgba[srcIdx + 2];
      rawData[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }

  const compressed = deflateSync(rawData);
  const idatChunk = createChunk("IDAT", compressed);

  const iendChunk = createChunk("IEND", new Uint8Array(0));

  const png = new Uint8Array(
    PNG_SIGNATURE.length +
      ihdrChunk.length +
      idatChunk.length +
      iendChunk.length
  );
  let offset = 0;
  png.set(PNG_SIGNATURE, offset);
  offset += PNG_SIGNATURE.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return png;
}

function deflateSync(data: Uint8Array): Uint8Array {
  const BLOCK_SIZE = 65535;
  const numBlocks = Math.ceil(data.length / BLOCK_SIZE);
  const result: number[] = [0x78, 0x01];

  for (let i = 0; i < numBlocks; i++) {
    const isLast = i === numBlocks - 1;
    const start = i * BLOCK_SIZE;
    const end = Math.min(start + BLOCK_SIZE, data.length);
    const blockLen = end - start;
    const nlen = blockLen ^ 0xffff;

    result.push(isLast ? 1 : 0);
    result.push(blockLen & 0xff);
    result.push((blockLen >> 8) & 0xff);
    result.push(nlen & 0xff);
    result.push((nlen >> 8) & 0xff);

    for (let j = start; j < end; j++) {
      result.push(data[j]);
    }
  }

  let adler = adler32(data);
  result.push((adler >> 24) & 0xff);
  result.push((adler >> 16) & 0xff);
  result.push((adler >> 8) & 0xff);
  result.push(adler & 0xff);

  return new Uint8Array(result);
}

function adler32(data: Uint8Array): number {
  let a = 1,
    b = 0;
  const MOD = 65521;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD;
    b = (b + a) % MOD;
  }
  return (b << 16) | a;
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
