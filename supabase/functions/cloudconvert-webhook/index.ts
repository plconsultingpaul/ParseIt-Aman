import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifySignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expectedHex === signatureHeader;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.text();

    const webhookSecret = Deno.env.get("CLOUDCONVERT_WEBHOOK_SIGNING_SECRET");
    if (webhookSecret) {
      const signatureHeader = req.headers.get("CloudConvert-Signature") || "";
      const isValid = await verifySignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload?.event;
    const jobData = payload?.job;

    console.log("[cloudconvert-webhook] Event received:", event);
    console.log("[cloudconvert-webhook] Job ID:", jobData?.id);
    console.log("[cloudconvert-webhook] Full payload:", JSON.stringify(payload, null, 2));

    if (!jobData?.id) {
      console.error("[cloudconvert-webhook] Missing job data in payload");
      return new Response(
        JSON.stringify({ error: "Missing job data in webhook payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const cloudconvertJobId = String(jobData.id);

    const { data: existingJob, error: lookupError } = await supabase
      .from("epdf_processing_jobs")
      .select("id, customer_id, imaging_document_id")
      .eq("cloudconvert_job_id", cloudconvertJobId)
      .maybeSingle();

    if (lookupError || !existingJob) {
      console.error("[cloudconvert-webhook] Job lookup failed:", lookupError?.message);
      return new Response(
        JSON.stringify({ error: "No matching job found", cloudconvert_job_id: cloudconvertJobId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetBucket = "documents-ready";
    let originalStoragePath: string | null = null;
    if (existingJob.imaging_document_id) {
      const { data: docRow } = await supabase
        .from("imaging_documents")
        .select("bucket_id, storage_path, imaging_buckets(supabase_storage_slug)")
        .eq("id", existingJob.imaging_document_id)
        .maybeSingle();
      const slug = (docRow as any)?.imaging_buckets?.supabase_storage_slug;
      if (slug) {
        targetBucket = slug;
      }
      if (docRow?.storage_path) {
        try {
          const url = new URL(docRow.storage_path);
          const bucketPrefix = `/storage/v1/object/public/${targetBucket}/`;
          const idx = url.pathname.indexOf(bucketPrefix);
          if (idx !== -1) {
            originalStoragePath = decodeURIComponent(url.pathname.substring(idx + bucketPrefix.length));
          }
        } catch {
          if (!docRow.storage_path.startsWith("http")) {
            originalStoragePath = docRow.storage_path;
          }
        }
      }
    }
    console.log(`[cloudconvert-webhook] Resolved target bucket: ${targetBucket}`);

    if (event === "job.finished") {
      try {
        const exportTask = jobData.tasks?.find(
          (t: { operation: string; status: string }) =>
            t.operation === "export/url" && t.status === "finished"
        );

        if (!exportTask?.result?.files?.[0]?.url) {
          await supabase
            .from("epdf_processing_jobs")
            .update({
              status: "failed",
              error_message: "Export task completed but no download URL found",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingJob.id);

          return new Response(
            JSON.stringify({ success: true, note: "Marked as failed: no export URL" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const downloadUrl = exportTask.result.files[0].url;
        const originalFilename = exportTask.result.files[0].filename || "converted.pdf";

        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) {
          await supabase
            .from("epdf_processing_jobs")
            .update({
              status: "failed",
              error_message: `Failed to download converted file: ${fileResponse.status}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingJob.id);

          return new Response(
            JSON.stringify({ success: true, note: "Marked as failed: download error" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        const timestamp = Date.now();
        const epdfFilePath = `epdf/${timestamp}_${originalFilename}`;

        console.log(`[cloudconvert-webhook] Uploading to bucket: ${targetBucket}, path: ${epdfFilePath}`);

        const { error: uploadError } = await supabase.storage
          .from(targetBucket)
          .upload(epdfFilePath, fileBuffer, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) {
          await supabase
            .from("epdf_processing_jobs")
            .update({
              status: "failed",
              error_message: `Storage upload failed: ${uploadError.message}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingJob.id);

          return new Response(
            JSON.stringify({ success: true, note: "Marked as failed: upload error" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: publicUrlData } = supabase.storage.from(targetBucket).getPublicUrl(epdfFilePath);
        const publicUrl = publicUrlData?.publicUrl || epdfFilePath;

        await supabase
          .from("epdf_processing_jobs")
          .update({
            status: "completed",
            output_storage_path: epdfFilePath,
            output_file_name: originalFilename,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingJob.id);

        if (existingJob.imaging_document_id) {
          await supabase
            .from("imaging_documents")
            .update({
              processing_status: "completed",
              epdf_storage_path: epdfFilePath,
              storage_path: publicUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingJob.imaging_document_id);
        }

        if (originalStoragePath && originalStoragePath !== epdfFilePath) {
          const { error: removeError } = await supabase.storage
            .from(targetBucket)
            .remove([originalStoragePath]);
          if (removeError) {
            console.warn(`[cloudconvert-webhook] Failed to remove original file: ${removeError.message}`);
          } else {
            console.log(`[cloudconvert-webhook] Removed original file: ${originalStoragePath}`);
          }
        }

        await supabase.from("epdf_usage_logs").insert({
          customer_id: existingJob.customer_id,
          job_id: existingJob.id,
          event_type: "pdf_processed",
        });

        return new Response(
          JSON.stringify({ success: true, status: "completed", storage_path: epdfFilePath }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (processErr) {
        await supabase
          .from("epdf_processing_jobs")
          .update({
            status: "failed",
            error_message: `Processing error: ${String(processErr)}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingJob.id);

        if (existingJob.imaging_document_id) {
          await supabase
            .from("imaging_documents")
            .update({
              processing_status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingJob.imaging_document_id);
        }

        return new Response(
          JSON.stringify({ success: true, note: "Marked as failed: processing exception" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (event === "job.failed") {
      const failedTasks = (jobData.tasks || [])
        .filter((t: any) => t.status === "error")
        .map((t: any) => `${t.name || t.operation}: ${t.message || t.code || "unknown error"}`)
        .join("; ");
      const errorMessage = failedTasks || jobData.message || "CloudConvert job failed (no message provided)";

      console.error("[cloudconvert-webhook] Job FAILED. Error:", errorMessage);
      console.error("[cloudconvert-webhook] Failed tasks detail:", JSON.stringify(
        (jobData.tasks || []).filter((t: any) => t.status === "error"),
        null, 2
      ));

      await supabase
        .from("epdf_processing_jobs")
        .update({
          status: "failed",
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingJob.id);

      if (existingJob.imaging_document_id) {
        await supabase
          .from("imaging_documents")
          .update({
            processing_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingJob.imaging_document_id);
      }

      return new Response(
        JSON.stringify({ success: true, status: "failed", error: errorMessage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, note: `Unhandled event type: ${event}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
