import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

type Source = "manual" | "api" | "email" | "sftp";

interface RunnerBody {
  documentId?: string;
  source?: Source;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Supabase configuration missing" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: RunnerBody;
  try {
    body = (await req.json()) as RunnerBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const documentId = body.documentId?.trim();
  const source: Source = body.source || "manual";
  if (!documentId) {
    return jsonResponse(400, { error: "documentId is required" });
  }

  try {
    const { data: doc, error: docErr } = await supabase
      .from("imaging_documents")
      .select(
        "id, bucket_id, document_type_id, bill_number, detail_line_id, storage_path, original_filename, imaging_buckets(name, url, supabase_storage_slug), imaging_document_types(name)",
      )
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return jsonResponse(404, { error: "Document not found" });

    const bucket = (doc as any).imaging_buckets || {};
    const docType = (doc as any).imaging_document_types || {};

    const { data: rulesData, error: rulesErr } = await supabase
      .from("imaging_document_type_processing_rules")
      .select("*")
      .eq("document_type_id", (doc as any).document_type_id)
      .eq("is_enabled", true)
      .order("priority", { ascending: true });
    if (rulesErr) throw rulesErr;

    const matchedRules = (rulesData || []).filter((r: any) => {
      const sources: string[] = Array.isArray(r.trigger_sources) ? r.trigger_sources : [];
      if (sources.length > 0 && !sources.includes(source)) return false;
      if (r.imaging_bucket_id && r.imaging_bucket_id !== (doc as any).bucket_id) return false;
      if (!r.workflow_v2_id) return false;
      return true;
    });

    if (matchedRules.length === 0) {
      return jsonResponse(200, { success: true, ranRules: 0, note: "no matching rules" });
    }

    const { data: metaRows } = await supabase
      .from("imaging_document_metadata")
      .select("field_id, value, imaging_metadata_fields(field_name)")
      .eq("document_id", documentId);
    const metadataByName: Record<string, string> = {};
    for (const row of (metaRows || []) as any[]) {
      const name = row?.imaging_metadata_fields?.field_name;
      if (name) metadataByName[name] = row.value;
    }

    let storagePath: string | null = (doc as any).storage_path || null;
    if (storagePath && !/^https?:\/\//i.test(storagePath) && bucket.supabase_storage_slug) {
      const { data: publicUrlData } = supabase.storage
        .from(bucket.supabase_storage_slug)
        .getPublicUrl(storagePath);
      storagePath = publicUrlData?.publicUrl || storagePath;
    }

    const invocations = matchedRules.map(async (rule: any) => {
      const payload = {
        workflowId: rule.workflow_v2_id,
        userId: null,
        pdfFilename: storagePath,
        originalPdfFilename: (doc as any).original_filename || null,
        extractedData: metadataByName,
        processingMode: "imaging",
        triggerSource: "imaging_document_type_rule",
        contextData: {
          imagingDocumentId: documentId,
          bucketId: (doc as any).bucket_id,
          bucketName: bucket.name || null,
          bucketUrl: bucket.url || null,
          documentTypeId: (doc as any).document_type_id,
          documentTypeName: docType.name || null,
          billNumber: (doc as any).bill_number || null,
          detailLineId: (doc as any).detail_line_id || null,
          storagePath,
          source,
          ruleId: rule.id,
          ruleName: rule.rule_name || null,
          metadata: metadataByName,
        },
      };

      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/json-workflow-processor-v2`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        const result = await resp.json().catch(() => ({}));
        return { ruleId: rule.id, ok: !!result?.success, error: result?.error || result?.details || null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[document-type-rule-runner] workflow invoke failed", { ruleId: rule.id, err: msg });
        return { ruleId: rule.id, ok: false, error: msg };
      }
    });

    const results = await Promise.all(invocations);
    return jsonResponse(200, {
      success: true,
      ranRules: results.length,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[document-type-rule-runner] error", msg);
    return jsonResponse(500, { error: "Rule runner failed", details: msg });
  }
});
