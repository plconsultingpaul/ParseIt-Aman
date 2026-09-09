import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const cloudConvertApiKey = Deno.env.get("CLOUDCONVERT_API_KEY");

    if (!cloudConvertApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "CLOUDCONVERT_API_KEY is not configured as an environment variable",
          configured: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ccResponse = await fetch("https://api.cloudconvert.com/v2/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cloudConvertApiKey}`,
        "Content-Type": "application/json",
      },
    });

    const ccData = await ccResponse.json();

    if (!ccResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          configured: true,
          error: ccData?.message || `CloudConvert API returned status ${ccResponse.status}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = ccData?.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const webhookUrl = `${supabaseUrl}/functions/v1/cloudconvert-webhook`;
    const webhookSecretConfigured = !!Deno.env.get("CLOUDCONVERT_WEBHOOK_SIGNING_SECRET");

    return new Response(
      JSON.stringify({
        success: true,
        configured: true,
        account: {
          username: userData?.username || "N/A",
          email: userData?.email || "N/A",
          credits: userData?.credits ?? null,
        },
        webhook: {
          url: webhookUrl,
          signing_secret_configured: webhookSecretConfigured,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
