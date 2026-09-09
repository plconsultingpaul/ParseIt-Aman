import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function getValueByPath(obj: any, path: string): any {
  try {
    if (path in obj && typeof obj[path] !== 'object') return obj[path];
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return null;
      current = current[part];
    }
    return current ?? null;
  } catch {
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TestRequest {
  configId?: string;
  loginEndpoint?: string;
  pingEndpoint?: string;
  username?: string;
  password?: string;
  tokenFieldName?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, message: "Missing authorization" }, 401);
    }
    const callerToken = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
    );
    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) {
      return jsonResponse({ success: false, message: "Unauthorized" }, 401);
    }

    const {
      configId,
      loginEndpoint: inlineLogin,
      pingEndpoint: inlinePing,
      username: inlineUsername,
      password: inlinePassword,
      tokenFieldName: inlineTokenField,
    }: TestRequest = await req.json();

    let loginEndpoint: string;
    let pingEndpoint: string;
    let username: string;
    let password: string;
    let tokenFieldName: string;

    if (configId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from("api_auth_config")
        .select(
          "login_endpoint, ping_endpoint, username, password, token_field_name"
        )
        .eq("id", configId)
        .maybeSingle();

      if (error) {
        return jsonResponse(
          { success: false, message: `Database error: ${error.message}` },
          500
        );
      }

      if (!data) {
        return jsonResponse(
          { success: false, message: "Configuration not found" },
          404
        );
      }

      loginEndpoint = data.login_endpoint;
      pingEndpoint = data.ping_endpoint || "";
      username = data.username;
      password = data.password;
      tokenFieldName = data.token_field_name || "access_token";
    } else if (inlineLogin && inlineUsername && inlinePassword) {
      loginEndpoint = inlineLogin;
      pingEndpoint = inlinePing || "";
      username = inlineUsername;
      password = inlinePassword;
      tokenFieldName = inlineTokenField || "access_token";
    } else {
      return jsonResponse(
        {
          success: false,
          message:
            "Provide either configId or loginEndpoint, username, and password",
        },
        400
      );
    }

    const loginResponse = await fetch(loginEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text().catch(() => "");
      return jsonResponse({
        success: false,
        message: `Login failed: ${loginResponse.status} ${loginResponse.statusText}${errorText ? ` - ${errorText}` : ""}`,
      });
    }

    const loginData = await loginResponse.json();
    const token = getValueByPath(loginData, tokenFieldName) ?? loginData[tokenFieldName];

    if (!token) {
      return jsonResponse({
        success: false,
        message: `Login response missing '${tokenFieldName}' field`,
      });
    }

    if (pingEndpoint) {
      const pingResponse = await fetch(pingEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (pingResponse.status !== 204 && !pingResponse.ok) {
        return jsonResponse({
          success: false,
          message: `Ping failed: ${pingResponse.status} ${pingResponse.statusText}`,
        });
      }
    }

    return jsonResponse({
      success: true,
      message: pingEndpoint
        ? "Login and Ping successful"
        : "Login successful",
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500
    );
  }
});
