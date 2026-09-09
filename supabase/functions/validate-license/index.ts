import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SALT = "parse-it-license-salt";
const ITERATIONS = 100000;
const IV_LENGTH = 12;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(SALT),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptLicense(
  encryptedBase64: string,
  secret: string
): Promise<object> {
  const raw = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, IV_LENGTH);
  const ciphertext = raw.slice(IV_LENGTH);
  const key = await deriveKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("[validate-license] Request method:", req.method);

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ valid: false, error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    console.log("[validate-license] Request body keys:", Object.keys(body));
    const { licenseData } = body;

    if (!licenseData || typeof licenseData !== "string") {
      console.error("[validate-license] Missing or invalid licenseData. Type:", typeof licenseData, "Length:", licenseData?.length);
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Missing or invalid licenseData field",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[validate-license] licenseData length:", licenseData.length);
    console.log("[validate-license] licenseData first 50 chars:", licenseData.substring(0, 50));

    const secret = Deno.env.get("PARSE_IT_LICENSE_KEY");
    if (!secret) {
      console.error("[validate-license] PARSE_IT_LICENSE_KEY env var is not set");
      return new Response(
        JSON.stringify({
          valid: false,
          error:
            "License key not configured on the server. Contact your administrator.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    console.log("[validate-license] PARSE_IT_LICENSE_KEY is set, length:", secret.length);

    console.log("[validate-license] Starting decryption...");
    const payload = await decryptLicense(licenseData, secret);
    console.log("[validate-license] Decryption successful. Payload keys:", Object.keys(payload));
    console.log("[validate-license] Payload:", JSON.stringify(payload));

    let expired = false;
    const payloadObj = payload as Record<string, unknown>;
    if (payloadObj.expiryDate && typeof payloadObj.expiryDate === "string") {
      const expiryDate = new Date(payloadObj.expiryDate);
      expired = expiryDate < new Date();
      console.log("[validate-license] Expiry date:", payloadObj.expiryDate, "Expired:", expired);
    } else {
      console.log("[validate-license] No expiry date found in payload");
    }

    console.log("[validate-license] Returning success response");
    return new Response(
      JSON.stringify({
        valid: true,
        expired,
        payload,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[validate-license] Error type:", typeof error);
    console.error("[validate-license] Error name:", error?.name);
    console.error("[validate-license] Error message:", error?.message);
    console.error("[validate-license] Full error:", error);
    if (error instanceof Error && error.stack) {
      console.error("[validate-license] Stack trace:", error.stack);
    }
    return new Response(
      JSON.stringify({
        valid: false,
        error:
          `Failed to decrypt license file: ${error instanceof Error ? error.message : String(error)}`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
