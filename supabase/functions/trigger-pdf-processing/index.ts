import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cloudConvertApiKey = Deno.env.get("CLOUDCONVERT_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cloudConvertApiKey) {
      return new Response(
        JSON.stringify({ error: "CLOUDCONVERT_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { file_url, customer_id, imaging_document_id, skip_ocr } = await req.json();

    console.log("[trigger-pdf-processing] Request received:", {
      file_url,
      customer_id,
      imaging_document_id,
      skip_ocr: !!skip_ocr,
    });

    if (!file_url) {
      console.error("[trigger-pdf-processing] Missing required fields");
      return new Response(
        JSON.stringify({ error: "file_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const insertData: Record<string, unknown> = {
      source_file_url: file_url,
      status: "pending",
    };
    if (customer_id) {
      insertData.customer_id = customer_id;
    }
    if (imaging_document_id) {
      insertData.imaging_document_id = imaging_document_id;
    }

    const { data: job, error: insertError } = await supabase
      .from("epdf_processing_jobs")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError || !job) {
      console.error("[trigger-pdf-processing] DB insert failed:", insertError?.message);
      return new Response(
        JSON.stringify({ error: "Failed to create job record", details: insertError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-pdf-processing] Job record created:", job.id);

    const webhookUrl = `${supabaseUrl}/functions/v1/cloudconvert-webhook`;

    const tasks: Record<string, Record<string, unknown>> = {
      "import-pdf": {
        operation: "import/url",
        url: file_url,
      },
    };

    if (skip_ocr) {
      console.log("[trigger-pdf-processing] skip_ocr=true, using pipeline: import -> optimize -> export");
      tasks["optimize-pdf"] = {
        operation: "optimize",
        input: ["import-pdf"],
        input_format: "pdf",
        profile: "web",
      };
    } else {
      console.log("[trigger-pdf-processing] skip_ocr=false, using pipeline: import -> ocr -> optimize -> export");
      tasks["ocr-pdf"] = {
        operation: "pdf/ocr",
        input: ["import-pdf"],
        language: ["eng"],
      };
      tasks["optimize-pdf"] = {
        operation: "optimize",
        input: ["ocr-pdf"],
        input_format: "pdf",
        profile: "web",
      };
    }

    tasks["export-pdf"] = {
      operation: "export/url",
      input: ["optimize-pdf"],
    };

    const cloudConvertPayload = {
      tasks,
      tag: customer_id,
      webhook_url: webhookUrl,
      webhook_events: ["job.finished", "job.failed"],
    };

    console.log("[trigger-pdf-processing] FULL CloudConvert payload being sent:", JSON.stringify(cloudConvertPayload, null, 2));

    const ccResponse = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cloudConvertApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cloudConvertPayload),
    });

    const ccData = await ccResponse.json();

    console.log("[trigger-pdf-processing] CloudConvert response status:", ccResponse.status);
    console.log("[trigger-pdf-processing] CloudConvert response body:", JSON.stringify(ccData, null, 2));

    if (!ccResponse.ok) {
      const errorDetail = ccData?.message || ccData?.error?.message || JSON.stringify(ccData);
      console.error("[trigger-pdf-processing] CloudConvert API error:", errorDetail);
      await supabase
        .from("epdf_processing_jobs")
        .update({
          status: "failed",
          error_message: `CloudConvert API error (${ccResponse.status}): ${errorDetail}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ error: "CloudConvert API error", details: errorDetail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cloudconvertJobId = ccData?.data?.id;

    await supabase
      .from("epdf_processing_jobs")
      .update({
        cloudconvert_job_id: String(cloudconvertJobId),
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        cloudconvert_job_id: cloudconvertJobId,
        status: "processing",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
