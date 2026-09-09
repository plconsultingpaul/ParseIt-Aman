import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import { extractText } from "npm:unpdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SftpConnection {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  is_enabled: boolean;
}

interface FolderConfig {
  id: string;
  folder_name: string;
  monitored_path: string;
  processed_path: string;
  imaging_bucket_id: string | null;
  is_enabled: boolean;
  polling_interval: number;
}

interface ProcessingRule {
  id: string;
  sftp_folder_config_id: string;
  rule_name: string;
  match_type: "filename_pattern" | "barcode_pattern";
  match_pattern: string;
  workflow_v2_id: string | null;
  imaging_bucket_id: string | null;
  is_enabled: boolean;
  priority: number;
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

interface PdfExtractionResult {
  text: string;
  rawItems: string[];
  error: string | null;
}

async function extractTextFromPdf(pdfBase64: string): Promise<PdfExtractionResult> {
  try {
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const { text } = await extractText(bytes);
    const rawText = Array.isArray(text) ? text.join("\n") : text;
    const allRawItems = (rawText || "").split(/\s+/).filter((s: string) => s.trim());
    return { text: rawText || "", rawItems: allRawItems, error: null };
  } catch (error: any) {
    console.warn("PDF text extraction failed:", error);
    return { text: "", rawItems: [], error: error.message || "Unknown extraction error" };
  }
}

function extractBarcodesFromText(text: string): string[] {
  const barcodes: string[] = [];
  const code39Regex = /\*([A-Za-z0-9][A-Za-z0-9\-_.$/+% ]{1,})\*/g;
  let match;
  while ((match = code39Regex.exec(text)) !== null) {
    const value = match[1].trim();
    if (value.length >= 2 && !/^\*+$/.test(value)) {
      barcodes.push(value);
    }
  }
  return [...new Set(barcodes)];
}

async function invokeWorkflowV2(
  supabaseUrl: string,
  supabaseKey: string,
  workflowId: string,
  pdfFilename: string,
  pdfBase64: string,
  detectedBarcodes: string[],
  matchedBarcode: string,
  storagePath: string,
  sftpFolderPath: string
): Promise<{ success: boolean; error?: string }> {
  const payload = {
    workflowId,
    userId: null,
    pdfFilename: storagePath || null,
    originalPdfFilename: pdfFilename || null,
    pdfBase64,
    extractedData: {},
    processingMode: "imaging",
    triggerSource: "imaging_sftp_rule",
    contextData: {
      sftpFolderPath,
      detectedBarcodes,
      matchedBarcode,
      storagePath,
      extractedData: {},
    },
  };

  try {
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

    const respText = await resp.text();
    console.log(`[SFTP-WF] Workflow response status: ${resp.status}, body length: ${respText.length}`);

    if (!resp.ok) {
      console.error(`[SFTP-WF] Workflow HTTP ${resp.status}: ${respText.substring(0, 500)}`);
      return { success: false, error: `HTTP ${resp.status}: ${respText.substring(0, 200)}` };
    }

    let result: any;
    try {
      result = JSON.parse(respText);
    } catch {
      console.error(`[SFTP-WF] Non-JSON response: ${respText.substring(0, 500)}`);
      return { success: false, error: `Non-JSON response: ${respText.substring(0, 200)}` };
    }

    return { success: !!result.success, error: result.error || result.details };
  } catch (fetchErr: any) {
    console.error(`[SFTP-WF] Fetch failed:`, fetchErr.message);
    return { success: false, error: `Fetch failed: ${fetchErr.message}` };
  }
}

function ok(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, folderConfigId } = body;

    const { data: connRow } = await supabase
      .from("imaging_sftp_connection")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!connRow) {
      return fail("No SFTP connection configured. Set up connection in Imaging Settings.", 400);
    }

    const conn: SftpConnection = connRow;

    if (action === "test_connection") {
      const SftpClient = (await import("npm:ssh2-sftp-client@11.0.0")).default;
      const sftp = new SftpClient();
      try {
        await sftp.connect({
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: conn.password,
        });
        await sftp.end();
        return ok({ success: true, message: "SFTP connection successful" });
      } catch (err: any) {
        return fail(`Connection failed: ${err.message}`, 400);
      }
    }

    if (action === "test_folder") {
      if (!folderConfigId) {
        return fail("folderConfigId is required for test_folder action", 400);
      }

      const { data: folderRow } = await supabase
        .from("imaging_sftp_folder_configs")
        .select("*")
        .eq("id", folderConfigId)
        .maybeSingle();

      if (!folderRow) {
        return fail("Folder config not found", 404);
      }

      const folder: FolderConfig = folderRow;

      const { data: ruleRows } = await supabase
        .from("imaging_sftp_processing_rules")
        .select("*")
        .eq("sftp_folder_config_id", folderConfigId)
        .eq("is_enabled", true)
        .order("priority");

      const folderRules: ProcessingRule[] = ruleRows || [];
      const filenameRules = folderRules.filter(r => r.match_type === "filename_pattern");
      const barcodeRules = folderRules.filter(r => r.match_type === "barcode_pattern");

      const SftpClient = (await import("npm:ssh2-sftp-client@11.0.0")).default;
      const sftp = new SftpClient();

      try {
        await sftp.connect({
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: conn.password,
        });

        const fileList = await sftp.list(folder.monitored_path);
        const pdfFiles = fileList.filter(
          (f: any) => f.type === "-" && f.name.toLowerCase().endsWith(".pdf")
        );

        const files: any[] = [];
        const ruleBreakdown: Record<string, number> = {};
        let matchedCount = 0;
        let unmatchedCount = 0;

        for (const pdfFile of pdfFiles) {
          let matched: ProcessingRule | null = null;
          let detectedBarcodes: string[] | null = null;
          let matchedBarcode: string | null = null;
          let barcodeError: string | null = null;
          let extractionError: string | null = null;

          for (const rule of filenameRules) {
            if (pdfFile.name.toLowerCase().includes(rule.match_pattern.toLowerCase())) {
              matched = rule;
              break;
            }
          }

          if (!matched && barcodeRules.length > 0) {
            try {
              const filePath = `${folder.monitored_path}/${pdfFile.name}`;
              const pdfBuffer = await sftp.get(filePath);
              const pdfBase64 = Buffer.from(pdfBuffer as Buffer).toString("base64");

              const extraction = await extractTextFromPdf(pdfBase64);
              const pdfText = extraction.text;
              extractionError = extraction.error;
              detectedBarcodes = extractBarcodesFromText(pdfText);

              if (detectedBarcodes && detectedBarcodes.length > 0) {
                for (const rule of barcodeRules) {
                  const bc = detectedBarcodes.find((b) => matchesPattern(b, rule.match_pattern));
                  if (bc) {
                    matched = rule;
                    matchedBarcode = bc;
                    break;
                  }
                }
              }
            } catch (scanErr: any) {
              barcodeError = scanErr.message || "Barcode scan failed";
              console.error(`Barcode scan failed for ${pdfFile.name}:`, scanErr.message);
            }
          }

          if (matched) {
            matchedCount++;
            ruleBreakdown[matched.rule_name] = (ruleBreakdown[matched.rule_name] || 0) + 1;
          } else {
            unmatchedCount++;
          }

          files.push({
            filename: pdfFile.name,
            size: pdfFile.size || 0,
            matchedRule: matched ? matched.rule_name : null,
            matchedPattern: matched ? matched.match_pattern : null,
            matchType: matched ? matched.match_type : null,
            detectedBarcodes: detectedBarcodes,
            matchedBarcode: matchedBarcode,
            barcodeError: barcodeError,
            extractionError: extractionError,
          });
        }

        await sftp.end().catch(() => {});

        return ok({
          success: true,
          folderName: folder.folder_name,
          monitoredPath: folder.monitored_path,
          totalRules: filenameRules.length,
          barcodeRules: barcodeRules.length,
          barcodesTested: barcodeRules.length > 0,
          files,
          summary: {
            totalFiles: pdfFiles.length,
            matchedFiles: matchedCount,
            unmatchedFiles: unmatchedCount,
            ruleBreakdown,
          },
        });
      } catch (err: any) {
        return fail(`SFTP test failed: ${err.message}`, 500);
      }
    }

    if (!conn.is_enabled) {
      return ok({ success: true, message: "SFTP monitoring is disabled", filesFound: 0, filesProcessed: 0 });
    }

    let foldersQuery = supabase
      .from("imaging_sftp_folder_configs")
      .select("*")
      .eq("is_enabled", true);

    if (folderConfigId) {
      foldersQuery = foldersQuery.eq("id", folderConfigId);
    }

    const { data: folderRows } = await foldersQuery;
    const folders: FolderConfig[] = folderRows || [];

    if (folders.length === 0) {
      return ok({ success: true, message: "No enabled folder configs found", filesFound: 0, filesProcessed: 0 });
    }

    const { data: allRules } = await supabase
      .from("imaging_sftp_processing_rules")
      .select("*")
      .eq("is_enabled", true)
      .order("priority");

    const rules: ProcessingRule[] = allRules || [];

    const SftpClient = (await import("npm:ssh2-sftp-client@11.0.0")).default;
    const sftp = new SftpClient();

    let totalFilesFound = 0;
    let totalFilesProcessed = 0;
    const results: any[] = [];

    try {
      await sftp.connect({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password,
      });

      for (const folder of folders) {
        const startTime = Date.now();
        let filesFound = 0;
        let filesProcessed = 0;
        let folderError: string | null = null;

        try {
          const fileList = await sftp.list(folder.monitored_path);
          const pdfFiles = fileList.filter(
            (f: any) => f.type === "-" && f.name.toLowerCase().endsWith(".pdf")
          );
          filesFound = pdfFiles.length;
          totalFilesFound += filesFound;

          const folderRules = rules.filter(
            (r) => r.sftp_folder_config_id === folder.id
          );

          for (const pdfFile of pdfFiles) {
            const filePath = `${folder.monitored_path}/${pdfFile.name}`;
            let fileProcessedSuccessfully = false;

            try {
              console.log(`[SFTP-RUN] Processing file: ${pdfFile.name}`);
              const pdfBuffer = await sftp.get(filePath);
              const pdfBase64 = Buffer.from(pdfBuffer as Buffer).toString("base64");

              const filenameRules = folderRules.filter(r => r.match_type === "filename_pattern");
              const barcodeRules = folderRules.filter(r => r.match_type === "barcode_pattern");
              console.log(`[SFTP-RUN] Rules for folder: ${filenameRules.length} filename, ${barcodeRules.length} barcode`);

              let matchedRule: ProcessingRule | null = null;
              for (const rule of filenameRules) {
                if (pdfFile.name.toLowerCase().includes(rule.match_pattern.toLowerCase())) {
                  matchedRule = rule;
                  console.log(`[SFTP-RUN] Filename rule matched: "${rule.rule_name}" (pattern: ${rule.match_pattern})`);
                  break;
                }
              }

              let detectedBarcodes: string[] = [];
              let matchedBarcode = "";

              if (!matchedRule && barcodeRules.length > 0) {
                console.log(`[SFTP-RUN] No filename match, extracting barcodes from PDF...`);
                const extraction = await extractTextFromPdf(pdfBase64);
                detectedBarcodes = extractBarcodesFromText(extraction.text);
                console.log(`[SFTP-RUN] Detected ${detectedBarcodes.length} barcodes: ${detectedBarcodes.join(', ') || '(none)'}`);
                if (extraction.error) {
                  console.warn(`[SFTP-RUN] PDF text extraction had error: ${extraction.error}`);
                }

                for (const rule of barcodeRules) {
                  const bc = detectedBarcodes.find((b) => matchesPattern(b, rule.match_pattern));
                  if (bc) {
                    matchedRule = rule;
                    matchedBarcode = bc;
                    console.log(`[SFTP-RUN] Barcode rule matched: "${rule.rule_name}" (pattern: ${rule.match_pattern}, barcode: ${bc})`);
                    break;
                  }
                }

                if (!matchedRule) {
                  console.log(`[SFTP-RUN] No barcode rule matched for ${pdfFile.name}`);
                }
              }

              if (matchedRule) {
                console.log(`[SFTP-RUN] Matched rule: "${matchedRule.rule_name}", workflow_v2_id: ${matchedRule.workflow_v2_id || 'none'}, bucket: ${matchedRule.imaging_bucket_id || 'none'}`);
              } else {
                console.log(`[SFTP-RUN] No rule matched for ${pdfFile.name}`);
              }

              if (matchedRule?.workflow_v2_id) {
                console.log(`[SFTP-RUN] Rule has workflow_v2_id, skipping imaging-sftp-processor (workflow handles storage)`);
                console.log(`[SFTP-RUN] Invoking Workflow V2: ${matchedRule.workflow_v2_id} for ${pdfFile.name}`);
                const wfResult = await invokeWorkflowV2(
                  supabaseUrl,
                  supabaseKey,
                  matchedRule.workflow_v2_id,
                  pdfFile.name,
                  pdfBase64,
                  detectedBarcodes,
                  matchedBarcode,
                  "",
                  folder.monitored_path
                );

                if (wfResult.success) {
                  console.log(`[SFTP-RUN] Workflow V2 completed successfully for ${pdfFile.name}`);
                  fileProcessedSuccessfully = true;
                  filesProcessed++;
                } else {
                  console.error(`[SFTP-RUN] Workflow V2 failed for ${pdfFile.name}: ${wfResult.error}`);
                }
              } else {
                const bucketId =
                  matchedRule?.imaging_bucket_id ||
                  folder.imaging_bucket_id;

                if (!bucketId) {
                  console.warn(`[SFTP-RUN] No bucket configured for ${pdfFile.name} (rule bucket: ${matchedRule?.imaging_bucket_id}, folder bucket: ${folder.imaging_bucket_id}), skipping`);
                  continue;
                }

                console.log(`[SFTP-RUN] No workflow, using imaging-sftp-processor with bucket: ${bucketId}`);

                const processorBody: any = {
                  pdfBase64,
                  originalFilename: pdfFile.name,
                  fileSize: pdfFile.size || 0,
                  bucketId,
                  sftpConfigId: folder.id,
                  sourceType: "sftp",
                };

                const imagingResponse = await fetch(
                  `${supabaseUrl}/functions/v1/imaging-sftp-processor`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${supabaseKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(processorBody),
                  }
                );

                if (imagingResponse.ok) {
                  const imagingResult = await imagingResponse.json();
                  console.log(`[SFTP-RUN] Processor result for ${pdfFile.name}: indexed=${imagingResult.indexed}, storagePath=${imagingResult.storagePath || 'none'}`);
                  fileProcessedSuccessfully = true;
                  filesProcessed++;
                } else {
                  const errBody = await imagingResponse.json().catch(() => ({}));
                  console.error(`[SFTP-RUN] Imaging processor returned ${imagingResponse.status} for ${pdfFile.name}:`, errBody);
                }
              }

              if (fileProcessedSuccessfully) {
                try {
                  const processedFilePath = `${folder.processed_path}/${pdfFile.name}`;
                  await sftp.rename(filePath, processedFilePath);
                  console.log(`[SFTP-RUN] Moved ${pdfFile.name} to processed folder`);
                } catch (moveErr: any) {
                  console.warn(`[SFTP-RUN] Failed to move ${pdfFile.name}: ${moveErr.message}`);
                }
              } else {
                console.warn(`[SFTP-RUN] File ${pdfFile.name} was NOT processed successfully, leaving in monitored folder`);
              }
            } catch (fileErr: any) {
              console.error(`[SFTP-RUN] Error processing ${pdfFile.name}: ${fileErr.message}`);
            }
          }

          totalFilesProcessed += filesProcessed;
        } catch (folderErr: any) {
          folderError = folderErr.message;
          console.error(
            `Error processing folder ${folder.folder_name}:`,
            folderErr.message
          );
        }

        const executionTimeMs = Date.now() - startTime;

        await supabase
          .from("imaging_sftp_folder_configs")
          .update({
            last_polled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", folder.id);

        await supabase
          .from("imaging_sftp_polling_logs")
          .insert({
            folder_config_id: folder.id,
            timestamp: new Date().toISOString(),
            status: folderError ? "failed" : "success",
            files_found: filesFound,
            files_processed: filesProcessed,
            error_message: folderError,
            execution_time_ms: executionTimeMs,
          });

        results.push({
          folderName: folder.folder_name,
          monitoredPath: folder.monitored_path,
          filesFound,
          filesProcessed,
          error: folderError,
          executionTimeMs,
        });
      }
    } finally {
      await sftp.end().catch(() => {});
    }

    return ok({
      success: true,
      message: `SFTP imaging monitor completed. Processed ${totalFilesProcessed} of ${totalFilesFound} files across ${folders.length} folders.`,
      foldersChecked: folders.length,
      filesFound: totalFilesFound,
      filesProcessed: totalFilesProcessed,
      results,
    });
  } catch (error: any) {
    console.error("Imaging SFTP monitor error:", error);
    return fail(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
});
