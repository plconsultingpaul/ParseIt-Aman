import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SECRET_FIELDS = ["live_secret_key", "test_secret_key", "live_webhook_secret", "test_webhook_secret"] as const;
type SecretField = typeof SECRET_FIELDS[number];

const PREFIXES: Record<SecretField, string> = {
  live_secret_key: "sk_live_",
  test_secret_key: "sk_test_",
  live_webhook_secret: "whsec_",
  test_webhook_secret: "whsec_",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mask(v: string | null | undefined) {
  const s = (v ?? "").trim();
  if (!s) return { set: false, last4: "" };
  return { set: true, last4: s.slice(-4) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await service
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_admin !== true) return json({ error: "Only administrators can manage Stripe keys" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const companyId = typeof body?.company_id === "string" ? body.company_id : "";
    if (!companyId) return json({ error: "company_id is required" }, 400);

    const { data: company } = await service
      .from("guest_payment_companies")
      .select("id")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return json({ error: "Company not found" }, 404);

    if (action === "save") {
      const updates = (body?.updates ?? {}) as Record<string, unknown>;
      const patch: Record<string, string> = {};
      for (const f of SECRET_FIELDS) {
        if (!(f in updates)) continue;
        const v = typeof updates[f] === "string" ? (updates[f] as string).trim() : "";
        if (v && !v.startsWith(PREFIXES[f])) {
          return json({ error: `${f.replace(/_/g, " ")} must start with ${PREFIXES[f]}` }, 400);
        }
        patch[f] = v;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await service
          .from("guest_payment_company_stripe_secrets")
          .upsert({ company_id: companyId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
        if (error) return json({ error: "Failed to save Stripe keys" }, 500);
      }
    } else if (action !== "status") {
      return json({ error: "Unknown action" }, 400);
    }

    const { data: row } = await service
      .from("guest_payment_company_stripe_secrets")
      .select("live_secret_key, test_secret_key, live_webhook_secret, test_webhook_secret")
      .eq("company_id", companyId)
      .maybeSingle();

    const status: Record<string, { set: boolean; last4: string }> = {};
    for (const f of SECRET_FIELDS) status[f] = mask(row?.[f] as string | undefined);

    return json({
      status,
      webhook_url: `${supabaseUrl}/functions/v1/guest-payment-webhook?company_id=${companyId}`,
    });
  } catch (err) {
    console.error("manage-guest-payment-stripe-secrets error", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
