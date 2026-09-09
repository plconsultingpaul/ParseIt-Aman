import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing authorization" }),
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
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { apiKey } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "API key is required"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const testQuery = "Google Headquarters Mountain View";
    const url = "https://places.googleapis.com/v1/places:searchText";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.id"
      },
      body: JSON.stringify({
        textQuery: testQuery
      })
    });

    const data = await response.json();

    if (response.ok && data.places && data.places.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Google Places API connection successful!",
          data: {
            name: data.places[0].displayName?.text || data.places[0].displayName,
            address: data.places[0].formattedAddress,
            place_id: data.places[0].id
          }
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } else if (response.status === 403 || data.error?.code === 403) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `API key invalid or restricted: ${data.error?.message || "Check your API key settings in Google Cloud Console"}`
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: `API returned error: ${data.error?.message || data.error?.status || "Unknown error"}`
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
