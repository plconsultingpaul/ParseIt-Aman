import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import Stripe from "npm:stripe@14.21.0";
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
  label: string
): Promise<{ rows: Array<Record<string, unknown>>; raw: unknown }> {
  const req = await buildResolvedRequest(supabase, ep, scope);
  const init: RequestInit = { method: req.method, headers: req.headers };
  if (req.body !== undefined) init.body = req.body;
  const res = await fetch(req.url, init);
  const text = await res.text();
  const snippet = text.length > 500 ? `${text.slice(0, 500)}...` : text;
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  if (!res.ok) throw new Error(`Upstream API returned ${res.status} for ${label}. URL: ${req.url} | Body: ${snippet}`);
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
    for (const m of mappings) out[m.target_key] = getPath(item, m.source_path);
    return out;
  });
  return { rows, raw: parsed };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const guestEmail = String(body?.guest_email ?? "").trim();
    const searchInputs = (body?.search_inputs ?? {}) as Record<string, unknown>;
    const selectedBillsInput = Array.isArray(body?.selected_bills) ? body.selected_bills : [];
    const honeypot = typeof body?.website === "string" ? body.website : "";

    if (honeypot.trim() !== "") {
      return json(400, { error: "Request rejected" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return json(400, { error: "A valid email address is required" });
    }
    if (selectedBillsInput.length === 0) {
      return json(400, { error: "Select at least one bill to pay" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const ip = getClientIp(req);
    const rl = await checkRateLimit(supabase, ip, "create-guest-checkout", 10, 60);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { data: config, error: configError } = await supabase
      .from("guest_payment_config")
      .select("routing_search_box_key, default_company_id, stripe_currency, stripe_success_url, stripe_cancel_url, stripe_line_item_name_template, surcharge_enabled, surcharge_percent, surcharge_label")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (configError) throw configError;
    if (!config) return json(404, { error: "Guest payment is not configured" });

    const routingKey = (config.routing_search_box_key ?? "").trim();
    const routingValueRaw = routingKey ? searchInputs[routingKey] : undefined;
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
        if (matched) { companyId = String(rule.company_id); break; }
      }
    }
    if (!companyId) companyId = (config.default_company_id as string | null) ?? null;
    if (!companyId) {
      return json(400, { error: "We couldn't find a company that matches what you entered. Please double-check the value and try again." });
    }

    const { data: company, error: coErr } = await supabase
      .from("guest_payment_companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();
    if (coErr) throw coErr;
    if (!company || company.enabled === false) {
      return json(400, { error: "We couldn't find a company that matches what you entered. Please double-check the value and try again." });
    }

    const stripeMode: "live" | "test" = company.stripe_mode === "live" ? "live" : "test";
    const { data: secrets, error: secErr } = await supabase
      .from("guest_payment_company_stripe_secrets")
      .select("live_secret_key, test_secret_key")
      .eq("company_id", companyId)
      .maybeSingle();
    if (secErr) throw secErr;
    const stripeSecret = String((stripeMode === "test" ? secrets?.test_secret_key : secrets?.live_secret_key) ?? "").trim();
    const expectedPrefix = stripeMode === "test" ? "sk_test_" : "sk_live_";
    if (!stripeSecret || !stripeSecret.startsWith(expectedPrefix)) {
      return json(400, { error: "Online payment is not available for this account yet. Please contact us to arrange payment." });
    }

    const api1 = company.search_api_1 as ApiEndpoint;
    const api2 = company.search_api_2 as ApiEndpoint;
    const grid2Cols = (company.grid_2_columns as Array<{ key: string; is_bill_number?: boolean; is_amount?: boolean }>) ?? [];
    const billNumberKey = grid2Cols.find((c) => c.is_bill_number)?.key;
    const amountKey = grid2Cols.find((c) => c.is_amount)?.key;

    if (!billNumberKey || !amountKey) {
      return json(500, { error: "Guest payment grid is missing bill number or amount configuration" });
    }
    if (!hasEndpointConfigured(api1) || !hasEndpointConfigured(api2)) {
      return json(500, { error: "Guest payment search APIs are not fully configured" });
    }

    const scope1: Record<string, unknown> = { ...searchInputs, guest_email: guestEmail };
    let grid1: { rows: Array<Record<string, unknown>>; raw: unknown };
    try {
      grid1 = await runEndpoint(supabase, api1, scope1, "search_api_1");
    } catch (e) {
      return json(502, { error: `Search step 1 failed: ${(e as Error).message}` });
    }

    const search1Merged = { ...scope1, ...(grid1.rows[0] ?? {}) };
    const scope2: Record<string, unknown> = {
      ...search1Merged,
      inputs: search1Merged,
      api1: grid1.raw,
      grid1: grid1.rows,
    };
    let authoritativeRows: Array<Record<string, unknown>> = [];
    try {
      const grid2 = await runEndpoint(supabase, api2, scope2, "search_api_2");
      authoritativeRows = grid2.rows;
    } catch (e) {
      return json(502, { error: `Search step 2 failed: ${(e as Error).message}` });
    }

    const byBill = new Map<string, Record<string, unknown>>();
    for (const r of authoritativeRows) {
      const bn = r[billNumberKey];
      if (bn == null) continue;
      byBill.set(String(bn), r);
    }

    const currency = String(config.stripe_currency || "usd").toLowerCase();
    const validatedBills: Array<{ bill_number: string; amount: number; snapshot: Record<string, unknown> }> = [];
    for (const sel of selectedBillsInput) {
      const bn = sel?.bill_number == null ? "" : String(sel.bill_number);
      if (!bn) return json(400, { error: "One or more selected bills is missing a bill number" });
      const authoritative = byBill.get(bn);
      if (!authoritative) return json(409, { error: `Bill ${bn} is no longer available. Please search again.` });
      const authAmount = Number(authoritative[amountKey]);
      if (!Number.isFinite(authAmount) || authAmount <= 0) {
        return json(409, { error: `Bill ${bn} has an invalid amount.` });
      }
      const claimed = Number(sel?.amount);
      if (Number.isFinite(claimed) && Math.abs(claimed - authAmount) > 0.005) {
        return json(409, { error: `Amount for bill ${bn} has changed. Please search again.` });
      }
      validatedBills.push({ bill_number: bn, amount: Math.round(authAmount * 100) / 100, snapshot: authoritative });
    }

    const subtotalAmount = Math.round(validatedBills.reduce((s, b) => s + b.amount, 0) * 100) / 100;
    if (subtotalAmount <= 0) return json(400, { error: "Total amount must be greater than zero" });
    const rawPct = Number(config.surcharge_percent);
    const surchargePercent =
      config.surcharge_enabled === true && Number.isFinite(rawPct) && rawPct > 0 ? Math.min(rawPct, 100) : 0;
    const surchargeAmount = Math.round(subtotalAmount * surchargePercent) / 100;
    const totalAmount = Math.round((subtotalAmount + surchargeAmount) * 100) / 100;
    const surchargeLabel =
      typeof config.surcharge_label === "string" && config.surcharge_label.trim() ? config.surcharge_label.trim() : "Surcharge";

    const { data: txn, error: insertError } = await supabase
      .from("guest_payment_transactions")
      .insert({
        guest_email: guestEmail,
        search_inputs: searchInputs,
        selected_bills: validatedBills,
        total_amount: totalAmount,
        subtotal_amount: subtotalAmount,
        surcharge_amount: surchargeAmount,
        surcharge_percent: surchargePercent,
        currency,
        status: "pending",
        company_id: companyId,
        stripe_mode: stripeMode,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });

    const nameTemplate =
      typeof config.stripe_line_item_name_template === "string" && config.stripe_line_item_name_template.trim().length > 0
        ? config.stripe_line_item_name_template
        : "Freight Invoice {bill_number}";
    const renderLineItemName = (bill: { bill_number: string; amount: number }): string => {
      const formattedAmount = bill.amount.toFixed(2);
      const rendered = nameTemplate
        .replace(/\{bill_number\}/g, bill.bill_number)
        .replace(/\{amount\}/g, formattedAmount)
        .trim();
      const truncated = rendered.length > 250 ? rendered.slice(0, 247) + "..." : rendered;
      return truncated.length > 0 ? truncated : `Bill ${bill.bill_number}`;
    };

    const billNumbersList = validatedBills.map((b) => b.bill_number).join(", ");

    const returnOrigin = (() => {
      const raw = typeof body?.return_origin === "string" ? body.return_origin.trim() : "";
      const candidate = raw || req.headers.get("origin") || "";
      try {
        if (!candidate) return "";
        const u = new URL(candidate);
        return `${u.protocol}//${u.host}`;
      } catch {
        return "";
      }
    })();
    const resolveConfiguredUrl = (raw: string | null | undefined, fallbackPath: string): string => {
      const value = (raw ?? "").trim();
      if (value.startsWith("http://") || value.startsWith("https://")) return value;
      const base = returnOrigin || new URL(req.url).origin.replace(/\/functions\/v1$/, "");
      if (value.startsWith("/")) return `${base}${value}`;
      return `${base}${fallbackPath}`;
    };

    const successUrl = resolveConfiguredUrl(config.stripe_success_url as string | null, "/guest-payment/success");
    const cancelUrl = resolveConfiguredUrl(config.stripe_cancel_url as string | null, "/guest-payment/cancel");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: guestEmail,
      line_items: [
        ...validatedBills.map((b) => ({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(b.amount * 100),
            product_data: { name: renderLineItemName(b) },
          },
        })),
        ...(surchargeAmount > 0
          ? [{
              quantity: 1,
              price_data: {
                currency,
                unit_amount: Math.round(surchargeAmount * 100),
                product_data: { name: `${surchargeLabel} ${surchargePercent}%`.slice(0, 250) },
              },
            }]
          : []),
      ],
      success_url: successUrl.includes("{CHECKOUT_SESSION_ID}")
        ? successUrl.replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}")
        : `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl.includes("{CHECKOUT_SESSION_ID}")
        ? cancelUrl
        : `${cancelUrl}${cancelUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      client_reference_id: txn.id,
      metadata: {
        transaction_id: txn.id,
        company_id: companyId,
        bill_numbers: billNumbersList.length > 500 ? billNumbersList.slice(0, 497) + "..." : billNumbersList,
      },
    });

    await supabase
      .from("guest_payment_transactions")
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", txn.id);

    return json(200, { url: session.url, session_id: session.id });
  } catch (err) {
    console.error("create-guest-checkout error", err);
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
