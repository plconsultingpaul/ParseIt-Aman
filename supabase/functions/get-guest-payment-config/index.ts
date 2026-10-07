import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/guestPaymentRateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const ip = getClientIp(req);
    const rl = await checkRateLimit(supabase, ip, "get-guest-payment-config", 60, 60);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { data, error } = await supabase
      .from("guest_payment_config")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return new Response(
        JSON.stringify({ error: "Guest payment is not configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const displaySafe = {
      use_company_logo: data.use_company_logo,
      logo_size: data.logo_size ?? "md",
      header_text: data.header_text ?? "",
      header_size: data.header_size ?? "3xl",
      sub_header_text: data.sub_header_text ?? "",
      sub_header_size: data.sub_header_size ?? "lg",
      receipt_note_text: typeof data.receipt_note_text === "string" ? data.receipt_note_text : "Your receipt will be sent here after payment.",
      search_boxes: Array.isArray(data.search_boxes) ? data.search_boxes : [],
      routing_search_box_key: data.routing_search_box_key ?? "",
      stripe_currency: data.stripe_currency ?? "usd",
      surcharge_enabled: data.surcharge_enabled === true,
      surcharge_percent: Number(data.surcharge_percent ?? 0) || 0,
      surcharge_label: data.surcharge_label ?? "Surcharge",
    };

    return new Response(JSON.stringify(displaySafe), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
