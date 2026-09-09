import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jwtVerify } from "npm:jose@5";

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ssoSecret = Deno.env.get("SSO_SHARED_SECRET");
    const currentAppId = Deno.env.get("SSO_CURRENT_APP_ID") || "unknown";

    if (!ssoSecret) {
      return new Response(
        JSON.stringify({ error: "SSO_SHARED_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { ticket } = await req.json();
    if (!ticket) {
      return new Response(
        JSON.stringify({ error: "Missing ticket" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secret = new TextEncoder().encode(ssoSecret);

    let payload;
    try {
      const result = await jwtVerify(ticket, secret, {
        audience: currentAppId,
      });
      payload = result.payload;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid or expired ticket" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = payload.email as string;
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Invalid ticket payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the user by email
    const { data: userList, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      return new Response(
        JSON.stringify({ error: "Failed to look up user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUser = userList.users.find(u => u.email === email);
    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: `No account found for ${email}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a magic link and extract the OTP token from it
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError) {
      return new Response(
        JSON.stringify({ error: linkError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the hashed_token from the generated link properties
    const hashedToken = linkData?.properties?.hashed_token;
    const actionLink = linkData?.properties?.action_link;

    if (!actionLink) {
      return new Response(
        JSON.stringify({ error: "Failed to generate login link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the token_hash and type from the action link
    const url = new URL(actionLink);
    const tokenHash = url.searchParams.get("token_hash") || url.searchParams.get("token");
    const type = url.searchParams.get("type") || "magiclink";

    return new Response(
      JSON.stringify({
        tokenHash,
        type,
        email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
