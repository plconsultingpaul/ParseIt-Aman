import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function isPrivateOrReservedHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return true;
  }

  if (hostname === "metadata.google.internal") {
    return true;
  }

  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }

  return false;
}

function validateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new Error("Requests to private or internal addresses are not allowed");
  }

  return parsed;
}

async function verifyAuth(req: Request): Promise<void> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    throw new Error("Authentication required");
  }
}

async function getAuthToken(supabase: any, authConfigId: string): Promise<string> {
  const { data: authConfig, error: authError } = await supabase
    .from("api_auth_config")
    .select("login_endpoint, username, password, token_field_name")
    .eq("id", authConfigId)
    .maybeSingle();

  if (authError || !authConfig) {
    throw new Error(`Failed to load auth config: ${authError?.message || "Not found"}`);
  }

  validateUrl(authConfig.login_endpoint);

  const loginResponse = await fetch(authConfig.login_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: authConfig.username,
      password: authConfig.password,
    }),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text().catch(() => "");
    throw new Error(`Authentication failed: ${loginResponse.status} ${errorText}`);
  }

  const loginData = await loginResponse.json();
  const tokenFieldName = authConfig.token_field_name || "access_token";
  const token = loginData[tokenFieldName];

  if (!token) {
    throw new Error(`Login response missing '${tokenFieldName}' field`);
  }

  return token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    await verifyAuth(req);

    const { apiSourceType, secondaryApiId, apiPath, httpMethod, queryString, fullUrl, authConfigId, responseType, requestBody } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetUrl = "";
    let authHeader = "";

    if (authConfigId) {
      const token = await getAuthToken(supabase, authConfigId);
      authHeader = `Bearer ${token}`;
    }

    if (fullUrl) {
      validateUrl(fullUrl);

      const allowedBaseUrls: string[] = [];

      const { data: apiSettings } = await supabase
        .from("api_settings")
        .select("path, password")
        .maybeSingle();

      if (apiSettings?.path) {
        allowedBaseUrls.push(apiSettings.path.replace(/\/+$/, "").toLowerCase());
        if (!authConfigId && apiSettings.password) {
          authHeader = `Bearer ${apiSettings.password}`;
        }
      }

      const { data: secondaryApis } = await supabase
        .from("secondary_api_configs")
        .select("base_url");

      if (secondaryApis) {
        for (const api of secondaryApis) {
          if (api.base_url) {
            allowedBaseUrls.push(api.base_url.replace(/\/+$/, "").toLowerCase());
          }
        }
      }

      const { data: authConfigs } = await supabase
        .from("api_auth_config")
        .select("login_endpoint");

      if (authConfigs) {
        for (const cfg of authConfigs) {
          if (cfg.login_endpoint) {
            try {
              const parsed = new URL(cfg.login_endpoint);
              allowedBaseUrls.push(`${parsed.protocol}//${parsed.host}`.toLowerCase());
            } catch {
              // skip invalid
            }
          }
        }
      }

      const normalizedFullUrl = fullUrl.toLowerCase();
      const isAllowed = allowedBaseUrls.some((base) => normalizedFullUrl.startsWith(base));

      if (!isAllowed) {
        console.error(`[track-trace-proxy] URL not in allowlist: ${fullUrl}`);
        return new Response(
          JSON.stringify({ error: "The requested URL is not in the list of configured API endpoints" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetUrl = fullUrl;
    } else {
      if (apiPath === undefined || apiPath === null) {
        return new Response(
          JSON.stringify({ error: "apiPath is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let baseUrl = "";

      if (apiSourceType === "main") {
        const { data: apiSettings, error: apiError } = await supabase
          .from("api_settings")
          .select("path, password")
          .maybeSingle();

        if (apiError) {
          throw new Error(`Failed to load API settings: ${apiError.message}`);
        }

        if (!apiSettings) {
          throw new Error("API settings not configured");
        }

        baseUrl = apiSettings.path;
        if (!authConfigId && apiSettings.password) {
          authHeader = `Bearer ${apiSettings.password}`;
        }
      } else if (apiSourceType === "secondary" && secondaryApiId) {
        const { data: secApiData, error: secApiError } = await supabase
          .from("secondary_api_configs")
          .select("base_url, auth_token")
          .eq("id", secondaryApiId)
          .maybeSingle();

        if (secApiError) {
          throw new Error(`Failed to load secondary API config: ${secApiError.message}`);
        }

        if (!secApiData) {
          throw new Error("Secondary API configuration not found");
        }

        baseUrl = secApiData.base_url;
        if (!authConfigId && secApiData.auth_token) {
          authHeader = `Bearer ${secApiData.auth_token}`;
        }
      } else {
        throw new Error("Invalid API source type or missing secondary API ID");
      }

      baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const normalizedPath = apiPath ? (apiPath.startsWith('/') ? apiPath : `/${apiPath}`) : '';
      targetUrl = `${baseUrl}${normalizedPath}${queryString ? '?' + queryString : ''}`;

      validateUrl(targetUrl);
    }

    if (!targetUrl) {
      throw new Error("Target URL not configured");
    }

    const fetchHeaders: Record<string, string> = {};

    if (responseType === "blob") {
      fetchHeaders["Accept"] = "*/*";
    } else {
      fetchHeaders["Content-Type"] = "application/json";
      fetchHeaders["Accept"] = "application/json";
    }

    if (authHeader) {
      fetchHeaders["Authorization"] = authHeader;
    }

    console.log(`[track-trace-proxy] Fetching: ${targetUrl}`);
    console.log(`[track-trace-proxy] Method: ${httpMethod || "GET"}`);

    const fetchOptions: RequestInit = {
      method: httpMethod || "GET",
      headers: fetchHeaders,
    };

    if (requestBody && (httpMethod === "POST" || httpMethod === "PUT" || httpMethod === "PATCH")) {
      fetchOptions.body = typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[track-trace-proxy] API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({
          error: `API request failed: ${response.status} ${response.statusText}`,
          details: errorText
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (responseType === "blob") {
      const blobData = await response.arrayBuffer();
      const contentType = response.headers.get("Content-Type") || "application/octet-stream";
      const contentDisposition = response.headers.get("Content-Disposition") || "";

      return new Response(blobData, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": contentDisposition,
        }
      });
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[track-trace-proxy] Error:", err);

    const isAuthError = err.message === "Authentication required" || err.message === "Missing or invalid Authorization header";
    const status = isAuthError ? 401 : 500;

    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
