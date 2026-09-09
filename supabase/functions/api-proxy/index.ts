import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const callerToken = authHeader.replace("Bearer ", "");

    const {
      apiPath,
      httpMethod,
      body,
      queryString,
      secondaryApiId,
      buttonId,
    } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let isQrEnabledButton = false;
    if (buttonId) {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: qrButtons } = await adminClient
        .from("execute_buttons")
        .select("qr_code_enabled")
        .eq("id", buttonId)
        .maybeSingle();
      isQrEnabledButton = qrButtons?.qr_code_enabled === true;
    }

    if (!isQrEnabledButton) {
      const authClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
      );
      const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
      if (callerError || !caller) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!apiPath && !secondaryApiId) {
      return new Response(
        JSON.stringify({ error: "apiPath is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let baseUrl: string;
    let authToken: string | null = null;

    if (secondaryApiId) {
      const { data: secondaryApi, error: secError } = await supabase
        .from("secondary_api_configs")
        .select("base_url, auth_token")
        .eq("id", secondaryApiId)
        .maybeSingle();

      if (secError) {
        throw new Error(`Failed to load secondary API: ${secError.message}`);
      }
      if (!secondaryApi?.base_url) {
        throw new Error("Secondary API not found or not configured");
      }

      baseUrl = secondaryApi.base_url.endsWith("/")
        ? secondaryApi.base_url.slice(0, -1)
        : secondaryApi.base_url;
      authToken = secondaryApi.auth_token || null;
    } else {
      const { data: apiSettings, error: apiError } = await supabase
        .from("api_settings")
        .select("path, password")
        .maybeSingle();

      if (apiError) {
        throw new Error(`Failed to load API settings: ${apiError.message}`);
      }
      if (!apiSettings?.path) {
        throw new Error("API settings not configured");
      }

      baseUrl = apiSettings.path.endsWith("/")
        ? apiSettings.path.slice(0, -1)
        : apiSettings.path;
      authToken = apiSettings.password || null;
    }

    const normalizedPath = !apiPath ? "" : apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    const targetUrl = `${baseUrl}${normalizedPath}${queryString ? "?" + queryString : ""}`;

    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (authToken) {
      fetchHeaders["Authorization"] = `Bearer ${authToken}`;
    }

    const method = (httpMethod || "POST").toUpperCase();

    console.log(`[api-proxy] ${method} ${targetUrl} (apiPath: "${apiPath}", baseUrl: "${baseUrl}")`);

    const fetchOptions: RequestInit = {
      method,
      headers: fetchHeaders,
    };

    if (body && method !== "GET" && method !== "HEAD") {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      let details: any;

      try {
        if (contentType.includes("application/json")) {
          details = await response.json();
        } else {
          details = await response.text();
        }
      } catch {
        details = "Unable to parse response body";
      }

      console.error(
        `[api-proxy] API error: ${response.status} ${response.statusText}`
      );

      return new Response(
        JSON.stringify({
          error: `API request failed: ${response.status} ${response.statusText}`,
          statusCode: response.status,
          statusText: response.statusText,
          details,
          url: targetUrl,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[api-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
