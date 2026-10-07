import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/guestPaymentRateLimit.ts";
import {
  type ApiEndpoint,
  buildResolvedRequest,
  getPath,
  hasEndpointConfigured,
} from "../_shared/guestPaymentEndpoint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function runEndpoint(
  supabase: ReturnType<typeof createClient>,
  ep: ApiEndpoint,
  scope: Record<string, unknown>,
  label: string,
): Promise<{ rows: Array<Record<string, unknown>>; raw: unknown }> {
  const req = await buildResolvedRequest(supabase, ep, scope);
  const init: RequestInit = { method: req.method, headers: req.headers };
  if (req.body !== undefined) init.body = req.body;

  const res = await fetch(req.url, init);
  const text = await res.text();
  const snippet = text.length > 500 ? `${text.slice(0, 500)}...` : text;
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep as text
  }

  if (!res.ok) {
    throw new Error(
      `Upstream API returned ${res.status} for ${label}. URL: ${req.url} | Body: ${snippet}`,
    );
  }

  const dataAtPath = getPath(parsed, ep.response_data_path ?? "");
  const items: Array<Record<string, unknown>> = Array.isArray(dataAtPath)
    ? (dataAtPath as Array<Record<string, unknown>>)
    : dataAtPath && typeof dataAtPath === "object"
    ? [dataAtPath as Record<string, unknown>]
    : [];

  const mappings = ep.response_mappings ?? [];
  const rows = items.map((item) => {
    if (mappings.length === 0) return item;
    const out: Record<string, unknown> = { ...item };
    for (const m of mappings) {
      out[m.target_key] = getPath(item, m.source_path);
    }
    return out;
  });

  return { rows, raw: parsed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const inputs = (body?.inputs ?? {}) as Record<string, unknown>;
    const honeypot = typeof body?.website === "string" ? body.website : "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (honeypot.trim() !== "") {
      return new Response(JSON.stringify({ grid1Rows: [], grid2Rows: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = getClientIp(req);
    const rl = await checkRateLimit(supabase, ip, "guest-payment-search", 20, 60);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { data: config, error } = await supabase
      .from("guest_payment_config")
      .select("routing_search_box_key, default_company_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Guest payment is not configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const routingKey = (config.routing_search_box_key ?? "").trim();
    const routingValueRaw = routingKey ? inputs[routingKey] : undefined;
    const routingValue = routingValueRaw == null ? "" : String(routingValueRaw).trim();

    let companyId: string | null = null;
    if (routingKey && routingValue) {
      const { data: rules, error: ruleErr } = await supabase
        .from("guest_payment_routing_rules")
        .select("company_id, match_type, match_value, case_sensitive, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (ruleErr) throw ruleErr;

      for (const rule of rules ?? []) {
        const mv = String(rule.match_value ?? "");
        if (!mv) continue;
        const cs = rule.case_sensitive === true;
        const a = cs ? routingValue : routingValue.toLowerCase();
        const b = cs ? mv : mv.toLowerCase();
        const matched =
          rule.match_type === "equals" ? a === b :
          rule.match_type === "contains" ? a.includes(b) :
          a.startsWith(b);
        if (matched) {
          companyId = String(rule.company_id);
          break;
        }
      }
    }

    if (!companyId) companyId = (config.default_company_id as string | null) ?? null;

    if (!companyId) {
      return new Response(
        JSON.stringify({
          error: routingKey
            ? "We couldn't find a company that matches what you entered. Please double-check the value and try again."
            : "Guest payment routing is not configured yet.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: company, error: coErr } = await supabase
      .from("guest_payment_companies")
      .select("id, name, enabled, search_api_1, search_api_2, grid_1_columns, grid_2_columns, document_button, branding, stripe_mode")
      .eq("id", companyId)
      .maybeSingle();
    if (coErr) throw coErr;
    if (!company || company.enabled === false) {
      return new Response(
        JSON.stringify({ error: "We couldn't find a company that matches what you entered. Please double-check the value and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const api1 = company.search_api_1 as ApiEndpoint;
    const api2 = company.search_api_2 as ApiEndpoint;

    if (!hasEndpointConfigured(api1)) {
      return new Response(
        JSON.stringify({ error: "Search is not configured for this company yet." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const grid1 = await runEndpoint(supabase, api1, inputs, "search_api_1");

    let grid2Rows: Array<Record<string, unknown>> = [];
    if (hasEndpointConfigured(api2)) {
      const search1Merged = { ...inputs, ...(grid1.rows[0] ?? {}) };
      const scope2 = {
        ...search1Merged,
        inputs: search1Merged,
        api1: grid1.raw,
        grid1: grid1.rows,
      };
      const grid2 = await runEndpoint(supabase, api2, scope2, "search_api_2");
      grid2Rows = grid2.rows;
    }

    const docButton = (company.document_button && typeof company.document_button === "object")
      ? (company.document_button as Record<string, unknown>)
      : {};
    const docLabel = typeof docButton.label === "string" && docButton.label.trim().length > 0
      ? docButton.label
      : "View Document";

    return new Response(
      JSON.stringify({
        grid1Rows: grid1.rows,
        grid2Rows,
        company_id: company.id,
        company_name: company.name,
        grid_1_columns: Array.isArray(company.grid_1_columns) ? company.grid_1_columns : [],
        grid_2_columns: Array.isArray(company.grid_2_columns) ? company.grid_2_columns : [],
        document_button: { enabled: docButton.enabled === true, label: docLabel },
        branding: company.branding && typeof company.branding === "object" ? company.branding : {},
        stripe_mode: company.stripe_mode === "live" ? "live" : "test",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
