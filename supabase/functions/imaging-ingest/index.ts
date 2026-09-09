import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function sanitizeFilename(name: string): string {
  const base = (name || "document.pdf").split(/[\\/]/).pop() || "document.pdf";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

async function loadPdfBytes(
  fileBase64: string | undefined,
  fileUrl: string | undefined,
): Promise<Uint8Array> {
  if (fileBase64) {
    const cleaned = fileBase64.replace(/^data:.*;base64,/, "");
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  if (fileUrl) {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Failed to fetch file_url: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("Either fileBase64 or fileUrl is required");
}

async function pdfHasTextLayer(bytes: Uint8Array): Promise<boolean> {
  try {
    const { extractText } = await import("npm:unpdf");
    const { text } = await extractText(bytes);
    const raw = Array.isArray(text) ? text.join("\n") : text;
    return (raw || "").trim().length > 50;
  } catch (_err) {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const isHealthCheck =
    req.method === "GET" &&
    (url.pathname.endsWith("/health") || url.searchParams.get("health") === "1");

  if (!isHealthCheck && req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedKey = Deno.env.get("IMAGING_INGEST_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Supabase configuration missing" });
  }
  if (!expectedKey) {
    return jsonResponse(500, { error: "IMAGING_INGEST_API_KEY is not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const auth = req.headers.get("Authorization") || "";
  const presented = auth.replace(/^Bearer\s+/i, "").trim();
  if (!presented || !timingSafeEqual(presented, expectedKey)) {
    if (!isHealthCheck) {
      try {
        await supabase.from("imaging_ingest_logs").insert({
          status: "unauthorized",
          error_message: "Missing or invalid bearer token",
        });
      } catch (_) {
        // best-effort
      }
    }
    return jsonResponse(401, { error: "Unauthorized" });
  }

  if (isHealthCheck) {
    return jsonResponse(200, {
      ok: true,
      service: "imaging-ingest",
      timestamp: new Date().toISOString(),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const bucketId = typeof body.bucketId === "string" ? body.bucketId : undefined;
  const bucketSlug = typeof body.bucketSlug === "string" ? body.bucketSlug : undefined;
  const documentTypeId = typeof body.documentTypeId === "string" ? body.documentTypeId : undefined;
  const documentTypeName = typeof body.documentTypeName === "string" ? body.documentTypeName : undefined;
  const billNumber = typeof body.billNumber === "string" ? body.billNumber.trim() : "";
  const detailLineId = typeof body.detailLineId === "string" ? body.detailLineId : null;
  const originalFilename = typeof body.originalFilename === "string" ? body.originalFilename : "";
  const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : undefined;
  const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : undefined;
  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : null;

  const logError = async (message: string, extras: Record<string, unknown> = {}) => {
    try {
      await supabase.from("imaging_ingest_logs").insert({
        status: "error",
        error_message: message.slice(0, 500),
        bill_number: billNumber || null,
        original_filename: originalFilename || null,
        ...extras,
      });
    } catch (_) {
      // best-effort
    }
  };

  if (!billNumber) {
    await logError("billNumber is required");
    return jsonResponse(400, { error: "billNumber is required" });
  }
  if (!originalFilename) {
    await logError("originalFilename is required");
    return jsonResponse(400, { error: "originalFilename is required" });
  }
  if (!bucketId && !bucketSlug) {
    await logError("bucketId or bucketSlug is required");
    return jsonResponse(400, { error: "bucketId or bucketSlug is required" });
  }
  if (!documentTypeId && !documentTypeName) {
    await logError("documentTypeId or documentTypeName is required");
    return jsonResponse(400, { error: "documentTypeId or documentTypeName is required" });
  }
  if (!fileBase64 && !fileUrl) {
    await logError("Either fileBase64 or fileUrl is required");
    return jsonResponse(400, { error: "Either fileBase64 or fileUrl is required" });
  }

  let bucketRow: { id: string; name: string; supabase_storage_slug: string | null; is_active: boolean } | null = null;
  {
    const q = supabase
      .from("imaging_buckets")
      .select("id, name, supabase_storage_slug, is_active");
    const { data, error } = bucketId
      ? await q.eq("id", bucketId).maybeSingle()
      : await q.eq("supabase_storage_slug", bucketSlug!).maybeSingle();
    if (error || !data) {
      await logError(`Bucket lookup failed: ${error?.message || "not found"}`);
      return jsonResponse(404, { error: "Bucket not found" });
    }
    bucketRow = data as typeof bucketRow;
  }
  if (bucketRow!.is_active === false) {
    await logError("Bucket is inactive", { bucket_id: bucketRow!.id });
    return jsonResponse(400, { error: "Bucket is inactive" });
  }
  const storageSlug = bucketRow!.supabase_storage_slug;
  if (!storageSlug) {
    await logError("Bucket has no supabase_storage_slug configured", { bucket_id: bucketRow!.id });
    return jsonResponse(500, { error: "Bucket has no storage slug configured" });
  }

  let docTypeRow: { id: string; name: string; is_active: boolean } | null = null;
  {
    const q = supabase.from("imaging_document_types").select("id, name, is_active");
    const { data, error } = documentTypeId
      ? await q.eq("id", documentTypeId).maybeSingle()
      : await q.ilike("name", documentTypeName!).maybeSingle();
    if (error || !data) {
      await logError(`Document type lookup failed: ${error?.message || "not found"}`, {
        bucket_id: bucketRow!.id,
      });
      return jsonResponse(404, { error: "Document type not found" });
    }
    docTypeRow = data as typeof docTypeRow;
  }
  if (docTypeRow!.is_active === false) {
    await logError("Document type is inactive", {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
    });
    return jsonResponse(400, { error: "Document type is inactive" });
  }

  const { data: bucketDocLink } = await supabase
    .from("imaging_bucket_document_types")
    .select("id")
    .eq("bucket_id", bucketRow!.id)
    .eq("document_type_id", docTypeRow!.id)
    .maybeSingle();
  if (!bucketDocLink) {
    await logError("Document type is not enabled on this bucket", {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
    });
    return jsonResponse(400, { error: "Document type is not enabled on this bucket" });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await loadPdfBytes(fileBase64, fileUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logError(`Failed to load PDF: ${msg}`, {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
    });
    return jsonResponse(400, { error: "Failed to load PDF", details: msg });
  }

  const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
  if (!header.startsWith("%PDF")) {
    await logError("File is not a PDF", {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
    });
    return jsonResponse(400, { error: "File is not a PDF" });
  }

  const hasTextLayer = await pdfHasTextLayer(pdfBytes);

  const now = new Date();
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const storagePath = `${yr}/${mo}/${crypto.randomUUID()}_${sanitizeFilename(originalFilename)}`;

  const { error: uploadError } = await supabase.storage
    .from(storageSlug)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    await logError(`Storage upload failed: ${uploadError.message}`, {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
    });
    return jsonResponse(500, { error: "Storage upload failed", details: uploadError.message });
  }

  const { data: publicUrlData } = supabase.storage.from(storageSlug).getPublicUrl(storagePath);
  const publicUrl = publicUrlData?.publicUrl || null;

  const { data: docRow, error: docInsertError } = await supabase
    .from("imaging_documents")
    .insert({
      bucket_id: bucketRow!.id,
      document_type_id: docTypeRow!.id,
      bill_number: billNumber,
      detail_line_id: detailLineId || null,
      storage_path: storagePath,
      original_filename: originalFilename,
      file_size: pdfBytes.byteLength,
      processing_status: "processing",
    })
    .select("id")
    .single();

  if (docInsertError || !docRow) {
    try {
      await supabase.storage.from(storageSlug).remove([storagePath]);
    } catch (_) {
      // best-effort orphan cleanup
    }
    const detail = docInsertError?.message || "unknown";
    await logError(`imaging_documents insert failed: ${detail}`, {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
    });
    return jsonResponse(500, { error: "Failed to create imaging document", details: detail });
  }

  const imagingDocumentId = docRow.id as string;

  const mergedMetadata: Record<string, string> = {};
  if (metadata) {
    for (const k of Object.keys(metadata)) {
      const v = metadata[k];
      if (v !== null && v !== undefined && String(v).length > 0) {
        mergedMetadata[k] = String(v);
      }
    }
  }
  if (billNumber && !mergedMetadata.billNumber) {
    mergedMetadata.billNumber = billNumber;
  }
  if (detailLineId && !mergedMetadata.detailLineId) {
    mergedMetadata.detailLineId = String(detailLineId);
  }

  const providedFieldNames = Object.keys(mergedMetadata);
  if (providedFieldNames.length > 0) {
    const { data: fieldRows } = await supabase
      .from("imaging_metadata_fields")
      .select("id, field_name")
      .in("field_name", providedFieldNames);
    const fieldMap = new Map<string, string>();
    for (const f of (fieldRows || []) as Array<{ id: string; field_name: string }>) {
      fieldMap.set(f.field_name, f.id);
    }
    const metaRows = providedFieldNames
      .filter((k) => fieldMap.has(k))
      .map((k) => ({
        document_id: imagingDocumentId,
        field_id: fieldMap.get(k)!,
        value: mergedMetadata[k],
      }));
    if (metaRows.length > 0) {
      try {
        await supabase.from("imaging_document_metadata").insert(metaRows);
      } catch (metaErr) {
        console.error("[imaging-ingest] metadata insert failed:", metaErr);
      }
    }
  }

  let cloudConvertJobId: string | null = null;
  try {
    const triggerRes = await fetch(`${supabaseUrl}/functions/v1/trigger-pdf-processing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_url: publicUrl || storagePath,
        imaging_document_id: imagingDocumentId,
        skip_ocr: hasTextLayer,
      }),
    });
    const trigger = await triggerRes.json().catch(() => ({}));
    if (!triggerRes.ok) {
      console.error("[imaging-ingest] trigger-pdf-processing error:", trigger);
      await supabase
        .from("imaging_documents")
        .update({ processing_status: "failed" })
        .eq("id", imagingDocumentId);
      await logError(`trigger-pdf-processing failed: ${trigger?.error || triggerRes.status}`, {
        bucket_id: bucketRow!.id,
        document_type_name: docTypeRow!.name,
        imaging_document_id: imagingDocumentId,
      });
      return jsonResponse(502, {
        error: "ePDF pipeline trigger failed",
        details: trigger,
        imagingDocumentId,
      });
    }
    cloudConvertJobId = trigger?.cloudconvert_job_id ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[imaging-ingest] trigger-pdf-processing threw:", msg);
    await supabase
      .from("imaging_documents")
      .update({ processing_status: "failed" })
      .eq("id", imagingDocumentId);
    await logError(`trigger-pdf-processing threw: ${msg}`, {
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
      imaging_document_id: imagingDocumentId,
    });
    return jsonResponse(502, {
      error: "ePDF pipeline trigger failed",
      details: msg,
      imagingDocumentId,
    });
  }

  try {
    const runnerRes = await fetch(`${supabaseUrl}/functions/v1/document-type-rule-runner`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId: imagingDocumentId, source: "api" }),
    });
    if (!runnerRes.ok) {
      const runnerBody = await runnerRes.text().catch(() => "");
      console.error("[imaging-ingest] document-type-rule-runner non-2xx:", runnerRes.status, runnerBody);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[imaging-ingest] document-type-rule-runner threw:", msg);
  }

  try {
    await supabase.from("imaging_ingest_logs").insert({
      status: "success",
      bucket_id: bucketRow!.id,
      document_type_name: docTypeRow!.name,
      bill_number: billNumber,
      original_filename: originalFilename,
      imaging_document_id: imagingDocumentId,
    });
  } catch (_) {
    // best-effort audit log
  }

  console.log(
    `[imaging-ingest] Success in ${Date.now() - startedAt}ms, doc=${imagingDocumentId}, cc=${cloudConvertJobId}, hasTextLayer=${hasTextLayer}`,
  );

  return jsonResponse(200, {
    success: true,
    imagingDocumentId,
    storagePath,
    cloudConvertJobId,
    ePdfStatus: "processing",
    hasTextLayer,
  });
});
