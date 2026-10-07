import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { executeApiEndpoint } from "./apiEndpoint.ts";
import { getValueByPath } from "./utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskToken(token: string | undefined | null): string {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 8) return '***';
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

function redactRequestDetails(details: any): any {
  if (!details || typeof details !== 'object') return details;
  const clone: any = Array.isArray(details) ? [...details] : { ...details };
  if (clone.headers && typeof clone.headers === 'object') {
    const redactedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(clone.headers)) {
      if (typeof v === 'string' && /^Bearer\s+/i.test(v)) {
        const rest = v.replace(/^Bearer\s+/i, '');
        redactedHeaders[k] = `Bearer ${maskToken(rest)}`;
      } else if (/authorization|apikey|api-key|token/i.test(k) && typeof v === 'string') {
        redactedHeaders[k] = maskToken(v);
      } else {
        redactedHeaders[k] = v as string;
      }
    }
    clone.headers = redactedHeaders;
  }
  return clone;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) {
      return jsonResponse({ success: false, message: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const stepConfig = body.stepConfig || {};
    const variableOverrides = (body.variableOverrides && typeof body.variableOverrides === 'object')
      ? body.variableOverrides
      : {};

    const contextData: Record<string, any> = { ...variableOverrides };
    const step = { id: 'test-step', step_type: 'api_endpoint', config_json: stepConfig };

    let result;
    try {
      result = await executeApiEndpoint(step, contextData, supabaseUrl, supabaseServiceKey);
    } catch (execError) {
      return jsonResponse({
        success: false,
        message: execError instanceof Error ? execError.message : String(execError),
        resolvedRequestDetails: null,
        resolvedRequestBody: '',
        responseData: null,
        extractedValues: [],
      });
    }

    const { stepOutput, responseData, resolvedRequestDetails, resolvedRequestBody } = result;

    const mappings = Array.isArray(stepConfig.responseDataMappings) ? stepConfig.responseDataMappings : [];
    const extractedValues: any[] = [];
    for (const mapping of mappings) {
      if (!mapping.responsePath || !mapping.updatePath) continue;
      let value = getValueByPath(responseData, mapping.responsePath);
      const hasDefault = mapping.defaultValue !== undefined && mapping.defaultValue !== null && mapping.defaultValue !== '';
      let usedDefault = false;
      if ((value === undefined || value === null || value === '') && hasDefault) {
        value = mapping.defaultValue;
        usedDefault = true;
      }
      extractedValues.push({
        responsePath: mapping.responsePath,
        updatePath: mapping.updatePath,
        value: value ?? null,
        usedDefault,
      });
    }

    return jsonResponse({
      success: true,
      apiSourceType: stepConfig.apiSourceType || 'main',
      resolvedRequestDetails: redactRequestDetails(resolvedRequestDetails),
      resolvedRequestBody,
      responseData,
      stepOutput,
      extractedValues,
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
