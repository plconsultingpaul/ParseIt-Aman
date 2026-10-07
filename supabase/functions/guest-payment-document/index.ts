import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/guestPaymentRateLimit.ts";
import {
  type ApiEndpoint,
  buildResolvedRequest,
  getPath,
  hasEndpointConfigured,
  interpolate,
} from "../_shared/guestPaymentEndpoint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

const BASE64_KEY_FALLBACKS = [
  "reportData",
  "data",
  "base64",
  "pdf",
  "pdfBase64",
  "content",
  "fileContent",
  "fileData",
  "body",
];

const FILENAME_KEY_FALLBACKS = ["reportName", "fileName", "filename", "name"];

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripBase64Prefix(s: string): string {
  const m = s.match(/^data:[^;]+;base64,(.*)$/);
  return m ? m[1] : s;
}

function looksLikeBase64(s: unknown): s is string {
  return typeof s === "string" && s.length > 100 && /^[A-Za-z0-9+/=\s\-_]+$/.test(s.slice(0, 200));
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = stripBase64Prefix(b64).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function findBase64InJson(payload: unknown, dataPath?: string): string | null {
  if (dataPath && dataPath.trim().length > 0) {
    const v = getPath(payload, dataPath.trim());
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const rec = payload as Record<string, unknown>;
    for (const key of BASE64_KEY_FALLBACKS) {
      const v = rec[key];
      if (looksLikeBase64(v)) return v;
    }
  }
  return null;
}

function findFilenameInJson(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const rec = payload as Record<string, unknown>;
  for (const key of FILENAME_KEY_FALLBACKS) {
    const v = rec[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function sanitizeFilename(name: string, defaultExt = ".pdf"): string {
  let f = name.replace(/[\r\n"\\]/g, "").replace(/[^\x20-\x7E]/g, "_").trim();
  if (!f) f = "document";
  f = f.replace(/\.(rpt|rptx|report)$/i, "");
  if (!/\.[a-z0-9]{2,5}$/i.test(f)) f += defaultExt;
  return f;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const companyId = typeof body?.company_id === "string" ? body.company_id : "";
    const inputs = (body?.inputs ?? {}) as Record<string, unknown>;
    const row = (body?.row ?? {}) as Record<string, unknown>;
    const grid = body?.grid === "grid2" ? "grid2" : "grid1";

    if (!companyId) return jsonError("Missing company_id", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const ip = getClientIp(req);
    const rl = await checkRateLimit(supabase, ip, "guest-payment-document", 30, 60);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { data: company, error } = await supabase
      .from("guest_payment_companies")
      .select("id, enabled, document_button")
      .eq("id", companyId)
      .maybeSingle();

    if (error) throw error;
    if (!company || company.enabled === false) {
      return jsonError("Company not found or disabled.", 404);
    }

    const docBtn = (company.document_button && typeof company.document_button === "object")
      ? (company.document_button as Record<string, unknown>)
      : {};

    if (docBtn.enabled !== true) {
      return jsonError("Document viewing is not enabled for this company.", 400);
    }

    const endpoint = docBtn.api_endpoint as ApiEndpoint | undefined;
    if (!endpoint || !hasEndpointConfigured(endpoint)) {
      return jsonError("Document API is not configured for this company.", 400);
    }

    const scope: Record<string, unknown> = {
      ...inputs,
      ...row,
      inputs,
      row,
      grid,
    };

    const resolved = await buildResolvedRequest(supabase, endpoint, scope);
    const init: RequestInit = { method: resolved.method, headers: resolved.headers };
    if (resolved.body !== undefined) init.body = resolved.body;

    const upstream = await fetch(resolved.url, init);
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return jsonError(
        `Document service returned ${upstream.status}. ${text}`.trim(),
        502,
      );
    }

    const upstreamContentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    const filenameTemplate = typeof docBtn.filename_template === "string" && docBtn.filename_template.trim().length > 0
      ? docBtn.filename_template
      : "";
    const templateFilename = filenameTemplate ? interpolate(filenameTemplate, scope).trim() : "";

    const isJsonResponse = upstreamContentType.includes("application/json")
      || upstreamContentType.includes("text/json");

    if (isJsonResponse) {
      const rawText = await upstream.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return jsonError(
          "Document service returned a JSON content type, but the body could not be parsed.",
          502,
        );
      }

      const b64 = findBase64InJson(parsed, endpoint.response_data_path);
      if (!b64) {
        const configuredPath = (endpoint.response_data_path ?? "").trim();
        const detail = configuredPath
          ? `no base64 string was found at "${configuredPath}"`
          : `no base64 string was found under any of: ${BASE64_KEY_FALLBACKS.join(", ")}. Set a Response Data Path on the document endpoint`;
        return jsonError(`Document service returned JSON, but ${detail}.`, 502);
      }

      let bytes: Uint8Array;
      try {
        bytes = decodeBase64ToBytes(b64);
      } catch (e) {
        return jsonError(
          `Failed to decode base64 payload from document service: ${e instanceof Error ? e.message : "unknown error"}.`,
          502,
        );
      }

      const upstreamFilename = findFilenameInJson(parsed);
      const chosenFilename = sanitizeFilename(templateFilename || upstreamFilename || "document");

      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": `inline; filename="${chosenFilename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const chosenFilename = sanitizeFilename(templateFilename || "document");
    const contentType = upstreamContentType || "application/pdf";

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${chosenFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unknown error", 500);
  }
});
