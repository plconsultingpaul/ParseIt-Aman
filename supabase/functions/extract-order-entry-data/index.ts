import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FieldConfig {
  id: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  aiExtractionInstructions?: string;
}

interface ExtractionResult {
  extractedData: Record<string, any>;
  confidenceScores: Record<string, number>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { pdfId, storageUrl, fields } = await req.json();

    console.log("[DEBUG] Received extraction request:", {
      pdfId,
      storageUrl: storageUrl?.substring(0, 100) + "...",
      fieldCount: fields?.length || 0,
    });

    if (!pdfId || !storageUrl || !fields) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Fetching active Gemini configuration...");

    const { data: activeKeyData } = await supabase
      .from("gemini_api_keys")
      .select("id, api_key")
      .eq("is_active", true)
      .maybeSingle();

    if (!activeKeyData || !activeKeyData.api_key) {
      console.log("[DEBUG] No active Gemini API key found");
      return new Response(
        JSON.stringify({
          error: "Gemini API key not configured. Please add your Google Gemini API key in Settings → Gemini Configuration"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiApiKey = activeKeyData.api_key;
    console.log("Active Gemini API key found");

    let modelName = "gemini-2.0-flash-exp";
    const { data: activeModelData } = await supabase
      .from("gemini_models")
      .select("model_name")
      .eq("api_key_id", activeKeyData.id)
      .eq("is_active", true)
      .maybeSingle();

    if (activeModelData?.model_name) {
      modelName = activeModelData.model_name;
      console.log("Using active Gemini model:", modelName);
    } else {
      console.log("No active model configuration found, using default:", modelName);
    }

    console.log("Downloading PDF from:", storageUrl);

    const pdfResponse = await fetch(storageUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.statusText}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log("[DEBUG] PDF downloaded, size:", pdfBuffer.byteLength, "bytes");

    const pdfBase64 = arrayBufferToBase64(pdfBuffer);

    console.log("Initializing Gemini AI with model:", modelName);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = buildExtractionPrompt(fields);

    console.log("Calling Gemini API for extraction...");

    let attempts = 0;
    const maxAttempts = 3;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      try {
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          { text: prompt },
        ]);

        const response = await result.response;
        console.log("[DEBUG] Gemini API call successful, parsing response...");
        const text = response.text();

        console.log("[DEBUG] Raw Gemini response length:", text.length, "chars");
        console.log("Raw Gemini response:", text);

        const extractionResult = parseGeminiResponse(text, fields);

        await supabase
          .from("order_entry_pdfs")
          .update({
            extraction_status: "completed",
            extracted_data: extractionResult.extractedData,
            extraction_confidence: extractionResult.confidenceScores,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pdfId);

        return new Response(JSON.stringify(extractionResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        lastError = error;
        attempts++;
        console.error(`Attempt ${attempts} failed:`, error.message);

        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    throw lastError || new Error("Extraction failed after retries");
  } catch (error: any) {
    console.error("[DEBUG] Extraction error:", error.message);
    console.error("[DEBUG] Full error stack:", error.stack);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to extract data from PDF",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildExtractionPrompt(fields: FieldConfig[]): string {
  let prompt = `You are a data extraction assistant. Extract the following information from this PDF document and return it in a JSON format.

IMPORTANT INSTRUCTIONS:
1. Extract data accurately based on field descriptions
2. Provide a confidence score (0.0 to 1.0) for each extracted field
3. If a field cannot be found, use empty string for text fields, 0 for numbers, false for booleans
4. Return ONLY valid JSON, no additional text

Extract these fields:\n\n`;

  fields.forEach((field: FieldConfig) => {
    prompt += `- **${field.fieldLabel}** (${field.fieldType}):\n`;

    if (field.aiExtractionInstructions) {
      prompt += `  Instructions: ${field.aiExtractionInstructions}\n`;
    } else {
      prompt += `  ${getDefaultInstructions(field.fieldType)}\n`;
    }

    prompt += `  JSON key: "${field.fieldName}"\n\n`;
  });

  prompt += `\nReturn your response in this exact JSON format:
{
  "data": {
    ${fields.map((f) => `"${f.fieldName}": "<extracted_value>"`).join(",\n    ")}
  },
  "confidence": {
    ${fields.map((f) => `"${f.fieldName}": 0.95`).join(",\n    ")}
  }
}`;

  return prompt;
}

function getDefaultInstructions(fieldType: string): string {
  const instructions: Record<string, string> = {
    text: "Extract as plain text",
    number: "Extract as a numeric value",
    date: "Extract as date in YYYY-MM-DD format",
    phone: "Extract as phone number in format (XXX) XXX-XXXX",
    dropdown: "Extract the exact text value",
    boolean: "Extract as true or false",
    file: "Not applicable for AI extraction",
  };

  return instructions[fieldType] || "Extract the value as appropriate";
}

function parseGeminiResponse(
  text: string,
  fields: FieldConfig[]
): ExtractionResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[DEBUG] No JSON found in Gemini response text");
      throw new Error("No JSON found in response");
    }

    console.log("[DEBUG] Extracted JSON from response, length:", jsonMatch[0].length);
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("[DEBUG] JSON parsed successfully, data keys:", Object.keys(parsed.data || {}));

    const extractedData: Record<string, any> = {};
    const confidenceScores: Record<string, number> = {};

    fields.forEach((field: FieldConfig) => {
      const value = parsed.data?.[field.fieldName];
      const confidence = parsed.confidence?.[field.fieldName] || 0.5;

      extractedData[field.fieldName] = formatFieldValue(
        value,
        field.fieldType
      );
      confidenceScores[field.fieldName] = Math.min(
        Math.max(confidence, 0),
        1
      );
    });

    return { extractedData, confidenceScores };
  } catch (error: any) {
    console.error("Failed to parse Gemini response:", error);

    const extractedData: Record<string, any> = {};
    const confidenceScores: Record<string, number> = {};

    fields.forEach((field: FieldConfig) => {
      extractedData[field.fieldName] = getDefaultValue(field.fieldType);
      confidenceScores[field.fieldName] = 0.0;
    });

    return { extractedData, confidenceScores };
  }
}

function formatFieldValue(value: any, fieldType: string): any {
  if (value === null || value === undefined) {
    return getDefaultValue(fieldType);
  }

  switch (fieldType) {
    case "number":
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    case "boolean":
      return Boolean(value);
    case "date":
      if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return value;
      }
      return "";
    case "phone":
      if (typeof value === "string") {
        return value;
      }
      return "";
    default:
      return String(value || "");
  }
}

function getDefaultValue(fieldType: string): any {
  switch (fieldType) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "file":
      return [];
    default:
      return "";
  }
}