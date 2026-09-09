import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText } from "npm:unpdf";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function extractTextFromPdf(pdfBase64: string): Promise<string> {
  const startTime = Date.now();
  console.log(`[PROC-TEXT] Starting text extraction, base64 length: ${pdfBase64.length}, estimated PDF size: ${Math.round(pdfBase64.length * 0.75 / 1024)}KB`);
  try {
    const bytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
    console.log(`[PROC-TEXT] Decoded to ${bytes.length} bytes, calling unpdf extractText...`);
    const { text } = await extractText(bytes);
    const elapsed = Date.now() - startTime;
    const rawText = Array.isArray(text) ? text.join("\n") : text;
    const trimmedLength = (rawText || "").trim().length;
    console.log(`[PROC-TEXT] extractText completed in ${elapsed}ms. Raw type: ${typeof text}, isArray: ${Array.isArray(text)}, arrayLength: ${Array.isArray(text) ? text.length : 'N/A'}, rawTextLength: ${(rawText || "").length}, trimmedLength: ${trimmedLength}`);
    if (trimmedLength > 0) {
      console.log(`[PROC-TEXT] First 200 chars of extracted text: "${(rawText || "").trim().substring(0, 200)}"`);
    } else {
      console.log(`[PROC-TEXT] NO TEXT EXTRACTED - unpdf returned empty/whitespace-only content`);
    }
    console.log(`[PROC-TEXT] hasTextLayer would be: ${trimmedLength > 50} (trimmedLength ${trimmedLength} > 50)`);
    return rawText || "";
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[PROC-TEXT] TEXT EXTRACTION FAILED after ${elapsed}ms:`, error?.message || error);
    console.error(`[PROC-TEXT] Error type: ${error?.constructor?.name}, stack: ${error?.stack?.substring(0, 500) || 'no stack'}`);
    console.log(`[PROC-TEXT] Returning empty string - this will cause hasTextLayer=false and skip_ocr=false (OCR WILL BE TRIGGERED)`);
    return "";
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

interface BarcodePattern {
  id: string;
  pattern_template: string;
  separator: string;
  fixed_document_type: string | null;
  bucket_id: string;
  priority: number;
}

interface MatchResult {
  documentType: string;
  detailLineId: string;
  bucketId: string;
  patternId: string;
}

function matchBarcodeToPattern(
  barcode: string,
  pattern: BarcodePattern,
  documentTypeNames: string[]
): MatchResult | null {
  const sep = pattern.separator || "-";
  const template = pattern.pattern_template;
  const parts = barcode.split(sep);

  if (parts.length < 2) return null;

  const templateParts = template.split(sep);

  if (pattern.fixed_document_type) {
    const expectedPrefix = pattern.fixed_document_type;
    if (parts[0] !== expectedPrefix) return null;
    const detailLineId = parts.slice(1).join(sep);
    if (!detailLineId) return null;
    return {
      documentType: expectedPrefix,
      detailLineId,
      bucketId: pattern.bucket_id,
      patternId: pattern.id,
    };
  }

  const docTypeIdx = templateParts.indexOf("{documentType}");
  const detailIdx = templateParts.indexOf("{detailLineId}");

  if (docTypeIdx === -1 || detailIdx === -1) return null;
  if (parts.length < Math.max(docTypeIdx, detailIdx) + 1) return null;

  const docType = parts[docTypeIdx];
  const detailLineId =
    detailIdx === templateParts.length - 1
      ? parts.slice(detailIdx).join(sep)
      : parts[detailIdx];

  if (!docType || !detailLineId) return null;

  const matchesKnownType = documentTypeNames.some(
    (name) => name.toLowerCase() === docType.toLowerCase()
  );
  if (!matchesKnownType) return null;

  return {
    documentType: docType,
    detailLineId,
    bucketId: pattern.bucket_id,
    patternId: pattern.id,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      pdfBase64,
      originalFilename,
      fileSize,
      bucketId,
      sftpConfigId,
      emailConfigId,
      sourceType,
      sourceEmailAddress,
      forceUnindexed,
      pageCount,
    } = await req.json();

    console.log(`[PROC] Received request: file=${originalFilename}, bucketId=${bucketId}, sourceType=${sourceType}, fileSize=${fileSize}, pdfBase64Length=${pdfBase64?.length || 0}, forceUnindexed=${!!forceUnindexed}, pageCount=${pageCount || 1}`);

    if (!pdfBase64 || !bucketId) {
      console.error(`[PROC] Missing required fields: pdfBase64=${!!pdfBase64}, bucketId=${!!bucketId}`);
      return new Response(
        JSON.stringify({ error: "pdfBase64 and bucketId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[PROC] Fetching barcode patterns...`);
    const { data: patterns, error: patternsError } = await supabase
      .from("imaging_barcode_patterns")
      .select("*")
      .eq("is_active", true)
      .order("priority");

    if (patternsError) {
      console.error(`[PROC] Failed to fetch barcode patterns:`, JSON.stringify(patternsError));
    }

    const activePatterns: BarcodePattern[] = patterns || [];
    console.log(`[PROC] Found ${activePatterns.length} active barcode patterns`);

    console.log(`[PROC] Fetching document types...`);
    const { data: docTypes, error: docTypesError } = await supabase
      .from("imaging_document_types")
      .select("id, name")
      .eq("is_active", true);

    if (docTypesError) {
      console.error(`[PROC] Failed to fetch document types:`, JSON.stringify(docTypesError));
    }

    const documentTypeNames = (docTypes || []).map((dt: any) => dt.name);
    const documentTypeMap = new Map(
      (docTypes || []).map((dt: any) => [dt.name.toLowerCase(), dt.id])
    );
    console.log(`[PROC] Found ${documentTypeNames.length} document types: ${documentTypeNames.join(', ')}`);

    console.log(`[PROC] Extracting text from PDF...`);
    const pdfText = await extractTextFromPdf(pdfBase64);
    const detectedBarcodes = extractBarcodesFromText(pdfText);
    const hasTextLayer = pdfText.trim().length > 50;
    console.log(`[PROC] Extracted text length: ${pdfText.length}, hasTextLayer=${hasTextLayer}, detected ${detectedBarcodes.length} barcodes: ${detectedBarcodes.join(', ') || '(none)'}`);

    console.log(`[PROC] Looking up bucket: ${bucketId}`);
    const { data: bucketRow, error: bucketError } = await supabase
      .from("imaging_buckets")
      .select("supabase_storage_slug, url")
      .eq("id", bucketId)
      .maybeSingle();

    if (bucketError) {
      console.error(`[PROC] Bucket lookup failed:`, JSON.stringify(bucketError));
    }
    console.log(`[PROC] Bucket lookup result: storageSlug=${bucketRow?.supabase_storage_slug || '(none)'}, url=${bucketRow?.url || '(none)'}, bucketRow=${JSON.stringify(bucketRow)}`);

    const storageSlug = bucketRow?.supabase_storage_slug;
    const fileId = crypto.randomUUID();
    const filePath = `${Date.now()}-${originalFilename || "document.pdf"}`;
    let storagePath: string;

    if (storageSlug) {
      console.log(`[PROC] Uploading to Supabase storage bucket "${storageSlug}" as "${filePath}"...`);
      const pdfBytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
      const { error: uploadError } = await supabase.storage
        .from(storageSlug)
        .upload(filePath, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) {
        console.error(`[PROC] Storage upload failed:`, JSON.stringify(uploadError));
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }
      console.log(`[PROC] Storage upload successful`);
      const { data: urlData } = supabase.storage
        .from(storageSlug)
        .getPublicUrl(filePath);
      storagePath = urlData?.publicUrl || filePath;
      console.log(`[PROC] Public URL: ${storagePath}`);
    } else {
      storagePath = `imaging/${filePath}`;
      console.log(`[PROC] No storage slug, using path: ${storagePath}`);
    }

    let matchResult: MatchResult | null = null;

    if (forceUnindexed) {
      const pc = Math.max(1, Number(pageCount) || 1);
      console.log(`[PROC] forceUnindexed=true, pageCount=${pc} - routing to ${pc > 1 ? 'imaging_batches' : 'imaging_unindexed_queue'}, skipping barcode/pattern matching.`);

      if (pc > 1) {
        const { error: batchError } = await supabase
          .from("imaging_batches")
          .insert({
            original_filename: originalFilename || "document.pdf",
            storage_path: storagePath,
            total_pages: pc,
            indexed_count: 0,
            status: "in_progress",
            source_type: sourceType || "email",
            source_email_address: sourceEmailAddress || null,
            source_email_config_id: emailConfigId || null,
            bucket_id: bucketId,
          });

        if (batchError) {
          console.error(`[PROC] Failed to create imaging batch:`, JSON.stringify(batchError));
          throw new Error(`Failed to create imaging batch: ${batchError.message || JSON.stringify(batchError)}`);
        }
        console.log(`[PROC] Multi-page PDF added to imaging_batches (${pc} pages)`);
      } else {
        const { error: queueError } = await supabase
          .from("imaging_unindexed_queue")
          .insert({
            bucket_id: bucketId,
            storage_path: storagePath,
            original_filename: originalFilename || "",
            file_size: fileSize || 0,
            detected_barcodes: detectedBarcodes,
            source_sftp_config_id: sftpConfigId || null,
            source_email_config_id: emailConfigId || null,
            source_type: sourceType || "email",
            source_email_address: sourceEmailAddress || null,
            status: "pending",
          });

        if (queueError) {
          console.error(`[PROC] Failed to queue unindexed item (forceUnindexed):`, JSON.stringify(queueError));
          throw new Error(`Failed to queue unindexed item: ${queueError.message || JSON.stringify(queueError)}`);
        }
        console.log(`[PROC] Single-page PDF added to imaging_unindexed_queue`);
      }

      if ((originalFilename || "").toLowerCase().endsWith(".pdf")) {
        console.log(`[PROC] Triggering CloudConvert for forceUnindexed doc, skip_ocr=${hasTextLayer}`);
        fetch(`${supabaseUrl}/functions/v1/trigger-pdf-processing`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_url: storagePath,
            skip_ocr: hasTextLayer,
          }),
        }).catch((err: any) => {
          console.error(`[PROC] Failed to trigger CloudConvert for forceUnindexed doc:`, err.message);
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          indexed: false,
          forcedUnindexed: true,
          asBatch: pc > 1,
          totalPages: pc,
          detectedBarcodes,
          storagePath,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[PROC] Matching ${detectedBarcodes.length} barcodes against ${activePatterns.length} patterns...`);
    for (const barcode of detectedBarcodes) {
      for (const pattern of activePatterns) {
        const result = matchBarcodeToPattern(
          barcode,
          pattern,
          documentTypeNames
        );
        if (result) {
          matchResult = result;
          console.log(`[PROC] Barcode "${barcode}" matched pattern "${pattern.pattern_template}": docType=${result.documentType}, detailLineId=${result.detailLineId}`);
          break;
        }
      }
      if (matchResult) break;
    }

    if (!matchResult) {
      console.log(`[PROC] No barcode matched any pattern`);
    }

    if (matchResult) {
      const docTypeId = documentTypeMap.get(
        matchResult.documentType.toLowerCase()
      );

      if (!docTypeId) {
        console.warn(
          `[PROC] Matched document type "${matchResult.documentType}" not found in imaging_document_types`
        );

        console.log(`[PROC] Inserting into unindexed queue (doc type not found)...`);
        const { error: queueError } = await supabase
          .from("imaging_unindexed_queue")
          .insert({
            bucket_id: bucketId,
            storage_path: storagePath,
            original_filename: originalFilename || "",
            file_size: fileSize || 0,
            detected_barcodes: detectedBarcodes,
            source_sftp_config_id: sftpConfigId || null,
            source_email_config_id: emailConfigId || null,
            source_type: sourceType || 'sftp',
            status: "pending",
          });

        if (queueError) {
          console.error(`[PROC] Failed to queue unindexed item:`, JSON.stringify(queueError));
        } else {
          console.log(`[PROC] Unindexed item queued successfully`);
        }

        const isPdfDocTypeNotFound = (originalFilename || "").toLowerCase().endsWith(".pdf");
        if (isPdfDocTypeNotFound) {
          console.log(`[PROC] Triggering CloudConvert for unindexed doc (type not found), skip_ocr=${hasTextLayer}`);
          fetch(`${supabaseUrl}/functions/v1/trigger-pdf-processing`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file_url: storagePath,
              skip_ocr: hasTextLayer,
            }),
          }).catch((err: any) => {
            console.error(`[PROC] Failed to trigger CloudConvert for unindexed doc:`, err.message);
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            indexed: false,
            reason: `Document type "${matchResult.documentType}" not found in configuration`,
            detectedBarcodes,
            storagePath,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[PROC] Inserting imaging document: bucketId=${matchResult.bucketId}, docTypeId=${docTypeId}, detailLineId=${matchResult.detailLineId}`);
      const { data: docRow, error: docError } = await supabase
        .from("imaging_documents")
        .insert({
          bucket_id: matchResult.bucketId,
          document_type_id: docTypeId,
          detail_line_id: matchResult.detailLineId,
          bill_number: "",
          storage_path: storagePath,
          original_filename: originalFilename || "",
          file_size: fileSize || 0,
          processing_status: "processing",
        })
        .select("id")
        .single();

      if (docError) {
        console.error(`[PROC] Failed to create imaging document:`, JSON.stringify(docError));
        throw new Error(`Failed to create imaging document: ${docError.message || JSON.stringify(docError)}`);
      }

      console.log(`[PROC] Imaging document created successfully, id=${docRow.id}`);

      const { data: detailMetaField } = await supabase
        .from("imaging_metadata_fields")
        .select("id")
        .eq("field_name", "detailLineId")
        .maybeSingle();

      if (detailMetaField?.id) {
        console.log(`[PROC] Writing detailLineId metadata for document ${docRow.id}`);
        await supabase
          .from("imaging_document_metadata")
          .upsert({
            document_id: docRow.id,
            field_id: detailMetaField.id,
            value: matchResult.detailLineId,
            updated_at: new Date().toISOString(),
          }, { onConflict: "document_id,field_id" });
      }

      const isPdf = (originalFilename || "").toLowerCase().endsWith(".pdf");
      if (isPdf) {
        console.log(`[PROC] Triggering CloudConvert for indexed doc ${docRow.id}, skip_ocr=${hasTextLayer}`);
        fetch(`${supabaseUrl}/functions/v1/trigger-pdf-processing`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_url: storagePath,
            imaging_document_id: docRow.id,
            skip_ocr: hasTextLayer,
          }),
        }).catch((err: any) => {
          console.error(`[PROC] Failed to trigger CloudConvert for ${docRow.id}:`, err.message);
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          indexed: true,
          documentType: matchResult.documentType,
          detailLineId: matchResult.detailLineId,
          detectedBarcodes,
          storagePath,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[PROC] No pattern match, inserting into unindexed queue...`);
    const { error: queueError } = await supabase
      .from("imaging_unindexed_queue")
      .insert({
        bucket_id: bucketId,
        storage_path: storagePath,
        original_filename: originalFilename || "",
        file_size: fileSize || 0,
        detected_barcodes: detectedBarcodes,
        source_sftp_config_id: sftpConfigId || null,
        status: "pending",
      });

    if (queueError) {
      console.error(`[PROC] Failed to queue unindexed item (non-fatal):`, JSON.stringify(queueError));
    } else {
      console.log(`[PROC] Unindexed item queued successfully`);
    }

    const isPdfUnindexed = (originalFilename || "").toLowerCase().endsWith(".pdf");
    if (isPdfUnindexed) {
      console.log(`[PROC] Triggering CloudConvert for unindexed doc, skip_ocr=${hasTextLayer}`);
      fetch(`${supabaseUrl}/functions/v1/trigger-pdf-processing`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_url: storagePath,
          skip_ocr: hasTextLayer,
        }),
      }).catch((err: any) => {
        console.error(`[PROC] Failed to trigger CloudConvert for unindexed doc:`, err.message);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        indexed: false,
        reason:
          detectedBarcodes.length === 0
            ? "No barcodes detected in document"
            : "No barcode matched configured patterns",
        detectedBarcodes,
        storagePath,
        queueError: queueError ? (queueError.message || JSON.stringify(queueError)) : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const errorDetail = error instanceof Error
      ? error.message
      : (error?.message || JSON.stringify(error) || "Unknown error");
    console.error(`[PROC] FATAL ERROR:`, errorDetail, error);
    return new Response(
      JSON.stringify({
        error: "Imaging processing failed",
        details: errorDetail,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
