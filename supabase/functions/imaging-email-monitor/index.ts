import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ImagingEmailConfig {
  id: string;
  config_name: string;
  provider: "office365" | "gmail";
  tenant_id: string;
  client_id: string;
  client_secret: string;
  gmail_client_id: string;
  gmail_client_secret: string;
  gmail_refresh_token: string;
  monitored_email: string;
  gmail_monitored_label: string;
  imaging_bucket_id: string | null;
  polling_interval: number;
  is_enabled: boolean;
  last_check: string | null;
  check_all_messages: boolean;
  post_process_action: string;
  processed_folder_path: string;
  post_process_action_on_failure: string;
  failure_folder_path: string;
  force_to_unindexed_queue: boolean;
}

interface EmailRule {
  id: string;
  rule_name: string;
  match_type: "subject" | "barcode_pattern";
  match_pattern: string;
  workflow_v2_id: string | null;
  imaging_bucket_id: string | null;
  is_enabled: boolean;
  priority: number;
}

interface PdfAttachment {
  filename: string;
  base64: string;
  pageCount: number;
}

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  receivedDate: string;
}

async function getPdfPageCount(base64: string): Promise<number> {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 1;
  }
}

async function office365Authenticate(
  config: ImagingEmailConfig
): Promise<string> {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.client_id || "",
        client_secret: config.client_secret || "",
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );
  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Office365 auth failed: ${errText}`);
  }
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function office365FetchEmails(
  config: ImagingEmailConfig,
  token: string
): Promise<EmailMessage[]> {
  let filter = "hasAttachments eq true and isRead eq false";
  if (!config.check_all_messages && config.last_check) {
    filter += ` and receivedDateTime gt ${new Date(config.last_check).toISOString()}`;
  }
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${config.monitored_email}/mailFolders/Inbox/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,from,receivedDateTime,hasAttachments`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Office365 fetch emails failed: ${errText}`);
  }
  const data = await resp.json();
  return (data.value || []).map((e: any) => ({
    id: e.id,
    subject: e.subject || "",
    from: e.from?.emailAddress?.address || "",
    receivedDate: e.receivedDateTime || "",
  }));
}

async function office365FindPdfs(
  config: ImagingEmailConfig,
  token: string,
  emailId: string
): Promise<PdfAttachment[]> {
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${config.monitored_email}/messages/${emailId}/attachments`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  const pdfs: PdfAttachment[] = [];
  for (const att of data.value || []) {
    if (att.name?.toLowerCase().endsWith(".pdf") && att.contentBytes) {
      const pageCount = await getPdfPageCount(att.contentBytes);
      pdfs.push({ filename: att.name, base64: att.contentBytes, pageCount });
    }
  }
  return pdfs;
}

async function office365LookupFolderId(
  baseUrl: string,
  token: string,
  displayName: string
): Promise<string | null> {
  const filterUrl = `${baseUrl}/mailFolders?$filter=${encodeURIComponent(`displayName eq '${displayName.replace(/'/g, "''")}'`)}&$top=1`;
  const resp = await fetch(filterUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `[POST_PROCESS][O365] Folder lookup failed (${resp.status}) for "${displayName}": ${errText}`
    );
  }
  const data = await resp.json();
  return data.value?.[0]?.id || null;
}

async function office365PostProcess(
  config: ImagingEmailConfig,
  token: string,
  emailId: string,
  action: string,
  folderPath: string
): Promise<void> {
  if (action === "none") return;
  const baseUrl = `https://graph.microsoft.com/v1.0/users/${config.monitored_email}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (action === "mark_read" || action === "move" || action === "archive") {
    const markResp = await fetch(`${baseUrl}/messages/${emailId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isRead: true }),
    });
    if (!markResp.ok) {
      const errText = await markResp.text();
      throw new Error(
        `[POST_PROCESS][O365] markAsRead failed (${markResp.status}) emailId=${emailId}: ${errText}`
      );
    }
    console.log(`[POST_PROCESS][O365] markAsRead succeeded emailId=${emailId}`);
  }

  if (action === "move" || action === "archive" || action === "delete") {
    let targetFolderId: string | null = null;

    if (action === "move") {
      targetFolderId = await office365LookupFolderId(baseUrl, token, folderPath);

      if (!targetFolderId) {
        console.log(
          `[POST_PROCESS][O365] Folder "${folderPath}" not found, attempting to create it`
        );
        const cr = await fetch(`${baseUrl}/mailFolders`, {
          method: "POST",
          headers,
          body: JSON.stringify({ displayName: folderPath }),
        });
        if (cr.ok) {
          const created = await cr.json();
          targetFolderId = created?.id || null;
          console.log(
            `[POST_PROCESS][O365] Created folder "${folderPath}" id=${targetFolderId}`
          );
        } else if (cr.status === 409) {
          console.log(
            `[POST_PROCESS][O365] Folder "${folderPath}" exists (409), re-fetching by filter`
          );
          targetFolderId = await office365LookupFolderId(
            baseUrl,
            token,
            folderPath
          );
          if (!targetFolderId) {
            throw new Error(
              `[POST_PROCESS][O365] Folder "${folderPath}" returned 409 on create but is not visible via $filter lookup`
            );
          }
        } else {
          const errText = await cr.text();
          throw new Error(
            `[POST_PROCESS][O365] Failed to create folder "${folderPath}" (${cr.status}): ${errText}`
          );
        }
      }
    } else if (action === "archive") {
      targetFolderId = await office365LookupFolderId(baseUrl, token, "Archive");
      if (!targetFolderId) {
        throw new Error(`[POST_PROCESS][O365] Archive folder not found`);
      }
    } else if (action === "delete") {
      targetFolderId = await office365LookupFolderId(
        baseUrl,
        token,
        "Deleted Items"
      );
      if (!targetFolderId) {
        throw new Error(`[POST_PROCESS][O365] Deleted Items folder not found`);
      }
    }

    if (targetFolderId) {
      const moveResp = await fetch(`${baseUrl}/messages/${emailId}/move`, {
        method: "POST",
        headers,
        body: JSON.stringify({ destinationId: targetFolderId }),
      });
      if (!moveResp.ok) {
        const errText = await moveResp.text();
        throw new Error(
          `[POST_PROCESS][O365] Move to folder "${folderPath}" failed (${moveResp.status}) emailId=${emailId}: ${errText}`
        );
      }
      console.log(
        `[POST_PROCESS][O365] Moved email to folder "${folderPath}" emailId=${emailId}`
      );
    }
  }
}

async function gmailAuthenticate(
  config: ImagingEmailConfig
): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.gmail_client_id || "",
      client_secret: config.gmail_client_secret || "",
      refresh_token: config.gmail_refresh_token || "",
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gmail auth failed: ${errText}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function gmailFetchEmails(
  config: ImagingEmailConfig,
  token: string
): Promise<EmailMessage[]> {
  let query = "has:attachment is:unread";
  if (
    config.gmail_monitored_label &&
    config.gmail_monitored_label !== "INBOX"
  ) {
    query += ` label:${config.gmail_monitored_label}`;
  } else {
    query += " in:inbox";
  }
  if (!config.check_all_messages && config.last_check) {
    const ts = Math.floor(new Date(config.last_check).getTime() / 1000);
    query += ` after:${ts}`;
  }

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gmail fetch emails failed: ${errText}`);
  }
  const data = await resp.json();
  const messages = data.messages || [];

  const results: EmailMessage[] = [];
  for (const m of messages) {
    const detailResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (detailResp.ok) {
      const detail = await detailResp.json();
      const hdrs = detail.payload?.headers || [];
      results.push({
        id: m.id,
        subject:
          hdrs.find((h: any) => h.name === "Subject")?.value || "",
        from: hdrs.find((h: any) => h.name === "From")?.value || "",
        receivedDate:
          hdrs.find((h: any) => h.name === "Date")?.value || "",
      });
    } else {
      results.push({ id: m.id, subject: "", from: "", receivedDate: "" });
    }
  }
  return results;
}

async function gmailFindPdfs(
  token: string,
  emailId: string
): Promise<PdfAttachment[]> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const msgData = await resp.json();
  const attachments: { filename: string; attachmentId: string }[] = [];

  const findAtts = (part: any) => {
    if (part.parts) part.parts.forEach(findAtts);
    else if (
      part.filename?.toLowerCase().endsWith(".pdf") &&
      part.body?.attachmentId
    ) {
      attachments.push({
        filename: part.filename,
        attachmentId: part.body.attachmentId,
      });
    }
  };
  findAtts(msgData.payload);

  const pdfs: PdfAttachment[] = [];
  for (const att of attachments) {
    const attResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/attachments/${att.attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (attResp.ok) {
      const attData = await attResp.json();
      const base64 = attData.data.replace(/-/g, "+").replace(/_/g, "/");
      const pageCount = await getPdfPageCount(base64);
      pdfs.push({ filename: att.filename, base64, pageCount });
    }
  }
  return pdfs;
}

async function gmailPostProcess(
  token: string,
  emailId: string,
  action: string,
  folderPath: string
): Promise<void> {
  if (action === "none") return;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (action === "mark_read" || action === "move" || action === "archive") {
    const markResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      }
    );
    if (!markResp.ok) {
      const errText = await markResp.text();
      throw new Error(
        `[POST_PROCESS][Gmail] markAsRead failed (${markResp.status}) emailId=${emailId}: ${errText}`
      );
    }
    console.log(`[POST_PROCESS][Gmail] markAsRead succeeded emailId=${emailId}`);
  }

  if (action === "move") {
    const labelsResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!labelsResp.ok) {
      const errText = await labelsResp.text();
      throw new Error(
        `[POST_PROCESS][Gmail] Failed to list labels (${labelsResp.status}): ${errText}`
      );
    }
    const labelsData = await labelsResp.json();
    let label = labelsData.labels?.find((l: any) => l.name === folderPath);
    if (!label) {
      const cr = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: folderPath,
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          }),
        }
      );
      if (cr.ok) {
        label = await cr.json();
      } else if (cr.status === 409) {
        const retryResp = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/labels",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (retryResp.ok) {
          const retryData = await retryResp.json();
          label = retryData.labels?.find((l: any) => l.name === folderPath);
        }
        if (!label) {
          throw new Error(
            `[POST_PROCESS][Gmail] Label "${folderPath}" returned 409 on create but is not visible on re-list`
          );
        }
      } else {
        const errText = await cr.text();
        throw new Error(
          `[POST_PROCESS][Gmail] Failed to create label "${folderPath}" (${cr.status}): ${errText}`
        );
      }
    }
    const moveResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          addLabelIds: [label.id],
          removeLabelIds: ["INBOX"],
        }),
      }
    );
    if (!moveResp.ok) {
      const errText = await moveResp.text();
      throw new Error(
        `[POST_PROCESS][Gmail] Move to label "${folderPath}" failed (${moveResp.status}) emailId=${emailId}: ${errText}`
      );
    }
    console.log(
      `[POST_PROCESS][Gmail] Moved email to label "${folderPath}" emailId=${emailId}`
    );
  }

  if (action === "archive") {
    const archiveResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ removeLabelIds: ["INBOX", "UNREAD"] }),
      }
    );
    if (!archiveResp.ok) {
      const errText = await archiveResp.text();
      throw new Error(
        `[POST_PROCESS][Gmail] Archive failed (${archiveResp.status}) emailId=${emailId}: ${errText}`
      );
    }
    console.log(`[POST_PROCESS][Gmail] Archived emailId=${emailId}`);
  }

  if (action === "delete") {
    const trashResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/trash`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!trashResp.ok) {
      const errText = await trashResp.text();
      throw new Error(
        `[POST_PROCESS][Gmail] Trash failed (${trashResp.status}) emailId=${emailId}: ${errText}`
      );
    }
    console.log(`[POST_PROCESS][Gmail] Trashed emailId=${emailId}`);
  }
}

function matchesSubjectRule(rule: EmailRule, subject: string): boolean {
  if (!rule.match_pattern) return false;
  return subject.toLowerCase().includes(rule.match_pattern.toLowerCase());
}

function matchesPattern(text: string, pattern: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  if (lowerPattern.endsWith('*')) {
    return lowerText.startsWith(lowerPattern.slice(0, -1));
  }
  if (lowerPattern.startsWith('*')) {
    return lowerText.endsWith(lowerPattern.slice(1));
  }
  if (lowerPattern.includes('*')) {
    const parts = lowerPattern.split('*');
    return lowerText.startsWith(parts[0]) && lowerText.endsWith(parts[1]);
  }
  return lowerText.includes(lowerPattern);
}

function matchesBarcodeRule(rule: EmailRule, barcodes: string[]): boolean {
  if (!rule.match_pattern) return false;
  return barcodes.some((b) => matchesPattern(b, rule.match_pattern));
}

async function invokeWorkflowV2(
  supabaseUrl: string,
  supabaseKey: string,
  workflowId: string,
  email: EmailMessage,
  pdfFilename: string,
  detectedBarcodes: string[],
  matchedBarcode: string,
  storagePath: string
): Promise<{ success: boolean; error?: string }> {
  const payload = {
    workflowId,
    userId: null,
    pdfFilename: storagePath || null,
    originalPdfFilename: pdfFilename || null,
    extractedData: {},
    processingMode: "imaging",
    triggerSource: "imaging_email_rule",
    senderEmail: email.from,
    contextData: {
      emailSubject: email.subject,
      emailFrom: email.from,
      emailDate: email.receivedDate,
      detectedBarcodes,
      matchedBarcode,
      storagePath,
      extractedData: {},
    },
  };

  const resp = await fetch(
    `${supabaseUrl}/functions/v1/json-workflow-processor-v2`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await resp.json();
  return { success: !!result.success, error: result.error || result.details };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let bodyConfigId: string | null = null;
    try {
      const body = await req.json();
      bodyConfigId = body?.configId || null;
    } catch {
      // no body or not JSON – run for all configs
    }

    let configs: ImagingEmailConfig[] = [];
    if (bodyConfigId) {
      const { data, error: cfgErr } = await supabase
        .from("imaging_email_monitoring_config")
        .select("*")
        .eq("id", bodyConfigId)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (data && data.is_enabled) configs = [data];
    } else {
      const { data, error: cfgErr } = await supabase
        .from("imaging_email_monitoring_config")
        .select("*")
        .eq("is_enabled", true);
      if (cfgErr) throw cfgErr;
      configs = data || [];
    }

    if (configs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Imaging email monitoring is disabled or not configured",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allResults: any[] = [];

    for (const config of configs) {
    if (!config.imaging_bucket_id) {
      allResults.push({
        configId: config.id,
        configName: config.config_name || config.monitored_email,
        success: false,
        error: "No imaging bucket configured",
      });
      continue;
    }

    const rulesQuery = supabase
      .from("imaging_email_processing_rules")
      .select("*")
      .eq("is_enabled", true)
      .order("priority");

    if (config.id) {
      rulesQuery.eq("email_config_id", config.id);
    }

    const { data: rulesData } = await rulesQuery;

    const rules: EmailRule[] = rulesData || [];
    const subjectRules = rules.filter((r) => r.match_type === "subject");
    const barcodeRules = rules.filter((r) => r.match_type === "barcode_pattern");

    console.log(
      `Imaging email monitor started, provider: ${config.provider}, rules: ${rules.length} (${subjectRules.length} subject, ${barcodeRules.length} barcode)`
    );

    let accessToken: string;
    if (config.provider === "gmail") {
      accessToken = await gmailAuthenticate(config);
    } else {
      accessToken = await office365Authenticate(config);
    }

    let emails: EmailMessage[];
    if (config.provider === "gmail") {
      emails = await gmailFetchEmails(config, accessToken);
    } else {
      emails = await office365FetchEmails(config, accessToken);
    }

    console.log(`Found ${emails.length} emails with attachments`);

    let processedCount = 0;
    let indexedCount = 0;
    let unindexedCount = 0;
    let workflowCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      let emailSuccess = true;
      try {
        try {
          const subjectMatch = subjectRules.find((r) =>
            matchesSubjectRule(r, email.subject)
          );

          let pdfs: PdfAttachment[];
          if (config.provider === "gmail") {
            pdfs = await gmailFindPdfs(accessToken, email.id);
          } else {
            pdfs = await office365FindPdfs(config, accessToken, email.id);
          }

          console.log(
            `Email "${email.subject}" from ${email.from}: ${pdfs.length} PDF(s)${subjectMatch ? `, matched subject rule "${subjectMatch.rule_name}"` : ""}`
          );

          for (const pdf of pdfs) {
            try {
              const effectiveBucketId =
                subjectMatch?.imaging_bucket_id ||
                config.imaging_bucket_id;

              const processorResp = await fetch(
                `${supabaseUrl}/functions/v1/imaging-sftp-processor`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${supabaseKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    pdfBase64: pdf.base64,
                    originalFilename: pdf.filename,
                    fileSize: pdf.base64.length,
                    bucketId: effectiveBucketId,
                    emailConfigId: config.id,
                    sourceType: "email",
                    sourceEmailAddress: email.from || null,
                    forceUnindexed: !!config.force_to_unindexed_queue,
                    pageCount: pdf.pageCount || 1,
                  }),
                }
              );

              if (!processorResp.ok) {
                const errText = await processorResp.text();
                console.error(
                  `Processor failed for ${pdf.filename}: ${errText}`
                );
                errorCount++;
                emailSuccess = false;
                continue;
              }

              const result = await processorResp.json();
              const detectedBarcodes: string[] = result.detectedBarcodes || [];

              let ruleToInvoke: EmailRule | undefined = subjectMatch || undefined;

              if (!ruleToInvoke && barcodeRules.length > 0 && detectedBarcodes.length > 0) {
                ruleToInvoke = barcodeRules.find((r) =>
                  matchesBarcodeRule(r, detectedBarcodes)
                );
              }

              if (!config.force_to_unindexed_queue && ruleToInvoke?.workflow_v2_id) {
                const matchedBc = detectedBarcodes.find((bc) =>
                  matchesPattern(bc, ruleToInvoke!.match_pattern)
                ) || detectedBarcodes[0] || "";

                console.log(
                  `Invoking Workflow V2 "${ruleToInvoke.rule_name}" for ${pdf.filename}, matched barcode: "${matchedBc}"`
                );
                const wfResult = await invokeWorkflowV2(
                  supabaseUrl,
                  supabaseKey,
                  ruleToInvoke.workflow_v2_id,
                  email,
                  pdf.filename,
                  detectedBarcodes,
                  matchedBc,
                  result.storagePath || ""
                );

                if (wfResult.success) {
                  workflowCount++;
                } else {
                  console.error(
                    `Workflow V2 failed for ${pdf.filename}: ${wfResult.error}`
                  );
                  errorCount++;
                  emailSuccess = false;
                  continue;
                }
              }

              if (result.indexed) {
                indexedCount++;
              } else {
                unindexedCount++;
              }
              processedCount++;
            } catch (pdfErr) {
              console.error(
                `Error processing PDF ${pdf.filename}:`,
                pdfErr
              );
              errorCount++;
              emailSuccess = false;
            }
          }
        } catch (emailErr) {
          console.error(`Error processing email ${email.id}:`, emailErr);
          errorCount++;
          emailSuccess = false;
        }
      } finally {
        const action = emailSuccess
          ? config.post_process_action || "mark_read"
          : config.post_process_action_on_failure || "none";
        const folder = emailSuccess
          ? config.processed_folder_path || "Processed"
          : config.failure_folder_path || "Failed";

        const ppStart = Date.now();
        console.log(
          `[POST_PROCESS] PRE-CALL provider=${config.provider} action=${action} folder="${folder}" emailId=${email.id} emailSuccess=${emailSuccess}`
        );
        try {
          if (config.provider === "gmail") {
            await gmailPostProcess(accessToken, email.id, action, folder);
          } else {
            await office365PostProcess(
              config,
              accessToken,
              email.id,
              action,
              folder
            );
          }
          console.log(
            `[POST_PROCESS] SUCCESS emailId=${email.id} elapsedMs=${Date.now() - ppStart}`
          );
        } catch (ppErr) {
          console.error(
            `[POST_PROCESS] FAILED emailId=${email.id} elapsedMs=${Date.now() - ppStart}:`,
            (ppErr as Error).message
          );
          errorCount++;
        }
      }
    }

    await supabase
      .from("imaging_email_monitoring_config")
      .update({ last_check: new Date().toISOString() })
      .eq("id", config.id);

    await supabase.from("email_polling_logs").insert({
      provider: config.provider,
      status: errorCount > 0 ? "partial" : "success",
      emails_found: emails.length,
      emails_processed: processedCount,
      emails_failed: errorCount,
      error_message:
        errorCount > 0
          ? `${errorCount} PDF(s) failed processing`
          : null,
    });

    const summary = {
      success: true,
      configId: config.id,
      configName: config.config_name || config.monitored_email,
      emailsFound: emails.length,
      pdfsProcessed: processedCount,
      indexed: indexedCount,
      unindexed: unindexedCount,
      workflowsTriggered: workflowCount,
      errors: errorCount,
    };

    console.log(`Imaging email monitor completed for ${config.config_name || config.monitored_email}:`, summary);
    allResults.push(summary);

    } // end for (const config of configs)

    return new Response(JSON.stringify({ success: true, results: allResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Imaging email monitor error:", error);
    return new Response(
      JSON.stringify({
        error: "Imaging email monitor failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
