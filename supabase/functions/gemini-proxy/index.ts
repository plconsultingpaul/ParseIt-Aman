import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProxyRequest {
  contents: any[];
}

async function getGeminiConfig(supabase: any) {
  const { data: activeKeyData } = await supabase
    .from("gemini_api_keys")
    .select("id, api_key")
    .eq("is_active", true)
    .maybeSingle();

  if (!activeKeyData?.api_key) {
    throw new Error(
      "No active Gemini API key configured. Please add your Google Gemini API key in Settings."
    );
  }

  let modelName = "gemini-2.5-pro";
  const { data: activeModelData } = await supabase
    .from("gemini_models")
    .select("model_name")
    .eq("api_key_id", activeKeyData.id)
    .eq("is_active", true)
    .maybeSingle();

  if (activeModelData?.model_name) {
    modelName = activeModelData.model_name;
  }

  return { apiKey: activeKeyData.api_key, modelName };
}

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
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { contents }: ProxyRequest = await req.json();

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'contents' array" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const config = await getGeminiConfig(supabase);
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ model: config.modelName });

    const result = await model.generateContent(contents);
    const response = result.response;
    const text = response.text();

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("gemini-proxy error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
