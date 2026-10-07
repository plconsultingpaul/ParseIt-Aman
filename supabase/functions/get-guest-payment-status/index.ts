import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase
      .from("guest_payment_transactions")
      .select("id, guest_email, selected_bills, total_amount, subtotal_amount, surcharge_amount, surcharge_percent, currency, status, receipt_sent_at, created_at, company_id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: "Lookup failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!data) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bills = Array.isArray(data.selected_bills)
      ? data.selected_bills.map((b: Record<string, unknown>) => ({
          bill_number: b.bill_number,
          amount: b.amount,
        }))
      : [];

    const [{ data: cfg }, { data: company }] = await Promise.all([
      supabase
        .from("guest_payment_config")
        .select("use_company_logo, logo_size, header_text, header_size, sub_header_text, sub_header_size")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      data.company_id
        ? supabase.from("guest_payment_companies").select("branding").eq("id", data.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const globalBranding = cfg
      ? {
          use_company_logo: cfg.use_company_logo,
          logo_size: cfg.logo_size ?? "md",
          header_text: cfg.header_text ?? "",
          header_size: cfg.header_size ?? "3xl",
          sub_header_text: cfg.sub_header_text ?? "",
          sub_header_size: cfg.sub_header_size ?? "lg",
        }
      : null;
    const companyBranding = company?.branding && typeof company.branding === "object" ? company.branding : null;

    return new Response(
      JSON.stringify({
        status: data.status,
        guest_email: data.guest_email,
        currency: data.currency,
        total_amount: data.total_amount,
        subtotal_amount: data.subtotal_amount ?? data.total_amount,
        surcharge_amount: Number(data.surcharge_amount) || 0,
        surcharge_percent: Number(data.surcharge_percent) || 0,
        bills,
        receipt_sent: !!data.receipt_sent_at,
        created_at: data.created_at,
        global_branding: globalBranding,
        company_branding: companyBranding,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
