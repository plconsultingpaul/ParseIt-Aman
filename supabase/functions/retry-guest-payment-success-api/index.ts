import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import {
  type ApiEndpoint,
  buildResolvedRequest,
  hasEndpointConfigured,
} from "../_shared/guestPaymentEndpoint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function callSuccessApi(
  supabase: ReturnType<typeof createClient>,
  ep: ApiEndpoint,
  scope: Record<string, unknown>,
) {
  const built = await buildResolvedRequest(supabase, ep, scope);
  const init: RequestInit = { method: built.method, headers: built.headers };
  if (built.body !== undefined) init.body = built.body;
  const res = await fetch(built.url, init);
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  return { status: res.status, ok: res.ok, response: parsed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const transactionId = typeof body?.transaction_id === "string" ? body.transaction_id : "";
    const onlyFailed = body?.only_failed !== false;
    if (!transactionId) {
      return new Response(JSON.stringify({ error: "transaction_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tx } = await service
      .from("guest_payment_transactions")
      .select("*")
      .eq("id", transactionId)
      .maybeSingle();
    if (!tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tx.status !== "paid") {
      return new Response(JSON.stringify({ error: "Transaction is not paid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cfg } = await service
      .from("guest_payment_config")
      .select("default_company_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const resolvedCompanyId = (tx.company_id as string | null) ?? (cfg?.default_company_id as string | null) ?? null;
    const { data: company } = resolvedCompanyId
      ? await service
          .from("guest_payment_companies")
          .select("success_api_call")
          .eq("id", resolvedCompanyId)
          .maybeSingle()
      : { data: null };

    const successApi = (company?.success_api_call ?? {}) as ApiEndpoint;
    if (!hasEndpointConfigured(successApi)) {
      return new Response(JSON.stringify({ error: "No Success API configured for this company" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bills = Array.isArray(tx.selected_bills) ? tx.selected_bills as Array<{ bill_number: string; amount: number; snapshot?: Record<string, unknown> }> : [];
    const existing = Array.isArray(tx.success_api_results) ? tx.success_api_results as Array<Record<string, unknown>> : [];
    const results: Array<Record<string, unknown>> = existing.slice();

    for (const bill of bills) {
      const prior = results.find((r) => r.bill_number === bill.bill_number);
      if (onlyFailed && prior && prior.status === "ok") continue;

      const scope = {
        bill_number: bill.bill_number,
        amount: bill.amount,
        guest_email: tx.guest_email,
        transaction_id: tx.id,
        currency: tx.currency,
        stripe_session_id: tx.stripe_session_id ?? "",
        stripe_payment_intent_id: tx.stripe_payment_intent_id ?? "",
        bill: bill.snapshot ?? {},
      };
      try {
        const out = await callSuccessApi(service, successApi, scope);
        const entry = {
          bill_number: bill.bill_number,
          status: out.ok ? "ok" : "error",
          http_status: out.status,
          response: out.response,
          retried_at: new Date().toISOString(),
        };
        const idx = results.findIndex((r) => r.bill_number === bill.bill_number);
        if (idx >= 0) results[idx] = entry; else results.push(entry);
      } catch (e) {
        const entry = {
          bill_number: bill.bill_number,
          status: "error",
          error: (e as Error).message,
          retried_at: new Date().toISOString(),
        };
        const idx = results.findIndex((r) => r.bill_number === bill.bill_number);
        if (idx >= 0) results[idx] = entry; else results.push(entry);
      }
    }

    await service
      .from("guest_payment_transactions")
      .update({ success_api_results: results, updated_at: new Date().toISOString() })
      .eq("id", transactionId);

    return new Response(JSON.stringify({ results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
