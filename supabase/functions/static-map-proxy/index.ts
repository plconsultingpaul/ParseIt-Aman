import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const center = url.searchParams.get("center");
    const zoom = url.searchParams.get("zoom") || "15";
    const size = url.searchParams.get("size") || "600x300";
    const maptype = url.searchParams.get("maptype") || "roadmap";
    const markers = url.searchParams.get("markers") || "";

    if (!center) {
      return new Response(
        JSON.stringify({ error: "center parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const configResponse = await fetch(
      `${supabaseUrl}/rest/v1/api_settings?select=google_places_api_key&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!configResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch API configuration" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const configData = await configResponse.json();
    const apiKey = configData?.[0]?.google_places_api_key;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Google Places API key not configured" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const params = new URLSearchParams({
      center,
      zoom,
      size,
      maptype,
      key: apiKey,
    });

    if (markers) {
      params.set("markers", markers);
    }

    const googleUrl = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    const mapResponse = await fetch(googleUrl);

    if (!mapResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch map image from Google" }),
        {
          status: mapResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const imageBuffer = await mapResponse.arrayBuffer();
    const contentType =
      mapResponse.headers.get("Content-Type") || "image/png";

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Proxy error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
