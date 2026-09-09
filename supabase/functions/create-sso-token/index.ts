import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ssoSecret = Deno.env.get("SSO_SHARED_SECRET");

    if (!ssoSecret) {
      return new Response(
        JSON.stringify({ error: "SSO_SHARED_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { targetUrl, appIdentifier } = await req.json();
    if (!targetUrl || !appIdentifier) {
      return new Response(
        JSON.stringify({ error: "Missing targetUrl or appIdentifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secret = new TextEncoder().encode(ssoSecret);
    const currentAppId = Deno.env.get("SSO_CURRENT_APP_ID") || "unknown";

    const token = await new SignJWT({
      email: user.email,
      iss: currentAppId,
      aud: appIdentifier,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("60s")
      .setIssuedAt()
      .sign(secret);

    const redirectUrl = `${targetUrl.replace(/\/$/, "")}/auth/sso?ticket=${token}`;

    return new Response(
      JSON.stringify({ redirectUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
