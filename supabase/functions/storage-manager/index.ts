import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type FileEntry = { name: string; size: number; created_at: string };

async function listAllFiles(
  supabase: any,
  bucket: string,
  prefix = "",
): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const isFolder = !item.id;
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (isFolder) {
        const nested = await listAllFiles(supabase, bucket, fullPath);
        results.push(...nested);
      } else {
        results.push({
          name: fullPath,
          size: item.metadata?.size ?? 0,
          created_at: item.created_at ?? item.updated_at ?? new Date().toISOString(),
        });
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
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
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const callerToken = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerToken}` } } },
    );
    const { data: { user: caller }, error: callerError } =
      await authClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "usage") {
      const { data: buckets, error: bucketErr } = await supabase.storage
        .listBuckets();
      if (bucketErr) throw bucketErr;

      const usage: Array<{
        bucket: string;
        fileCount: number;
        totalBytes: number;
        oldest: string | null;
        newest: string | null;
      }> = [];

      for (const b of buckets ?? []) {
        try {
          const files = await listAllFiles(supabase, b.name);
          let totalBytes = 0;
          let oldest: string | null = null;
          let newest: string | null = null;
          for (const f of files) {
            totalBytes += f.size;
            if (!oldest || f.created_at < oldest) oldest = f.created_at;
            if (!newest || f.created_at > newest) newest = f.created_at;
          }
          usage.push({
            bucket: b.name,
            fileCount: files.length,
            totalBytes,
            oldest,
            newest,
          });
        } catch (e) {
          console.error(`Error scanning bucket ${b.name}:`, e);
          usage.push({
            bucket: b.name,
            fileCount: 0,
            totalBytes: 0,
            oldest: null,
            newest: null,
          });
        }
      }

      return new Response(JSON.stringify({ success: true, usage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "preview" || action === "purge") {
      const bucketNames: string[] = Array.isArray(body?.buckets)
        ? body.buckets
        : [];
      const cutoffIso: string | undefined = body?.cutoffDate;
      if (bucketNames.length === 0 || !cutoffIso) {
        return new Response(
          JSON.stringify({
            error: "Provide buckets array and cutoffDate (ISO string).",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: existingBuckets } = await supabase.storage.listBuckets();
      const allowed = new Set((existingBuckets ?? []).map((b: any) => b.name));
      const targets = bucketNames.filter((n) => allowed.has(n));

      const details: Record<
        string,
        { fileCount: number; totalBytes: number; error?: string }
      > = {};
      let totalFiles = 0;
      let totalBytes = 0;

      const perBucket = await Promise.all(
        targets.map(async (bucket) => {
          try {
            const files = await listAllFiles(supabase, bucket);
            const eligible = files.filter((f) => f.created_at < cutoffIso);
            const bucketBytes = eligible.reduce((s, f) => s + f.size, 0);
            return { bucket, eligible, bucketBytes, error: null as string | null };
          } catch (e: any) {
            console.error(`Error scanning bucket ${bucket}:`, e);
            return {
              bucket,
              eligible: [] as FileEntry[],
              bucketBytes: 0,
              error: e?.message || "Scan failed",
            };
          }
        }),
      );

      for (const r of perBucket) {
        details[r.bucket] = {
          fileCount: r.eligible.length,
          totalBytes: r.bucketBytes,
          ...(r.error ? { error: r.error } : {}),
        };
        totalFiles += r.eligible.length;
        totalBytes += r.bucketBytes;

        if (action === "purge" && r.eligible.length > 0) {
          const paths = r.eligible.map((f) => f.name);
          const BATCH = 100;
          for (let i = 0; i < paths.length; i += BATCH) {
            const chunk = paths.slice(i, i + BATCH);
            const { error: rmErr } = await supabase.storage
              .from(r.bucket)
              .remove(chunk);
            if (rmErr) {
              console.error(
                `Error removing ${chunk.length} files from ${r.bucket}:`,
                rmErr,
              );
            }
          }
        }
      }

      if (action === "purge") {
        await supabase.from("storage_purge_logs").insert({
          performed_by: caller.id,
          buckets: targets,
          cutoff_date: cutoffIso,
          files_removed: totalFiles,
          bytes_freed: totalBytes,
          details,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          action,
          details,
          totalFiles,
          totalBytes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use usage, preview, or purge." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("Storage manager error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
