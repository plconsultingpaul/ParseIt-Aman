import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TestRequest {
  apiKeyId?: string;
  apiKey?: string;
  mode: "test" | "list_models";
  modelName?: string;
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchApiKey(supabase: any, apiKeyId: string): Promise<string> {
  const { data, error } = await supabase
    .from("gemini_api_keys")
    .select("api_key")
    .eq("id", apiKeyId)
    .maybeSingle();

  if (error) throw new Error(`Database error: ${error.message}`);
  if (!data?.api_key) throw new Error("API key not found");
  return data.api_key;
}

async function handleTest(apiKey: string, modelName?: string) {
  const testModel = modelName || "gemini-1.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: testModel });

  const result = await model.generateContent(
    'Say "Connection successful" if you can read this.'
  );
  const response = result.response;
  const text = response.text();

  return {
    success: true,
    message: `API key is valid! Successfully tested with ${testModel}.`,
    data: {
      model: testModel,
      response: text.substring(0, 100),
    },
  };
}

async function handleListModels(apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.models || !Array.isArray(data.models)) {
    throw new Error("Invalid response from Gemini API");
  }

  const models = data.models
    .filter((m: any) => m.name?.startsWith("models/gemini"))
    .map((m: any) => ({
      name: m.name.replace("models/", ""),
      displayName: m.displayName || m.name.replace("models/", ""),
      description: m.description || "",
      supportedGenerationMethods: m.supportedGenerationMethods || [],
    }));

  if (models.length === 0) {
    return {
      success: false,
      message: "API key is valid but no models are available",
    };
  }

  return {
    success: true,
    message: `Connection successful! Found ${models.length} available model${models.length !== 1 ? "s" : ""}.`,
    data: {
      modelCount: models.length,
      models,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing authorization", 401);
    }
    const callerToken = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
    );
    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) {
      return errorResponse("Unauthorized", 401);
    }

    const { apiKeyId, apiKey: rawApiKey, mode, modelName }: TestRequest = await req.json();

    if (!apiKeyId && !rawApiKey) {
      return errorResponse("apiKeyId or apiKey is required");
    }

    if (mode !== "test" && mode !== "list_models") {
      return errorResponse('mode must be "test" or "list_models"');
    }

    let apiKey: string;
    if (rawApiKey) {
      apiKey = rawApiKey;
    } else {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      apiKey = await fetchApiKey(supabase, apiKeyId!);
    }

    let result;
    if (mode === "test") {
      result = await handleTest(apiKey, modelName);
    } else {
      result = await handleListModels(apiKey);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";

    let message = "Failed to connect to Google Gemini API";
    if (raw.includes("API_KEY_INVALID") || raw.includes("API key not valid")) {
      message = "Invalid API key. Please check your Google Gemini API key.";
    } else if (raw.includes("API key expired")) {
      message =
        "API key has expired. Please regenerate your key in Google AI Studio.";
    } else if (raw.includes("quota")) {
      message = "API quota exceeded. Please check your Google Cloud Console.";
    } else if (raw.includes("not found")) {
      message = `Model not found or not accessible with this API key. ${raw}`;
    } else if (raw.includes("API key not found")) {
      message = raw;
    } else {
      message = raw;
    }

    console.error("test-gemini-key error:", raw);
    return new Response(
      JSON.stringify({ success: false, message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
