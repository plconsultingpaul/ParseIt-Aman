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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, name, allowedMimeTypes } = await req.json();

    if (action === "create") {
      if (!name) {
        return new Response(
          JSON.stringify({ error: "Bucket name is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: storageError } = await supabase.storage.createBucket(
        name,
        {
          public: true,
          allowedMimeTypes: allowedMimeTypes || [
            "application/pdf",
            "image/tiff",
            "image/png",
            "image/jpeg",
          ],
        }
      );

      if (storageError && !storageError.message?.includes("already exists")) {
        return new Response(JSON.stringify({ error: storageError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, slug: name }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!name) {
        return new Response(
          JSON.stringify({ error: "Bucket name is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: emptyError } = await supabase.storage.emptyBucket(name);
      if (emptyError && !emptyError.message?.includes("not found")) {
        console.warn("Could not empty bucket:", emptyError.message);
      }

      const { error: deleteError } = await supabase.storage.deleteBucket(name);
      if (deleteError && !deleteError.message?.includes("not found")) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "create" or "delete".' }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
