import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type LogTypeConfig = {
  table: string;
  dateColumn: string;
  status?: string;
  statusIn?: string[];
  child?: { table: string; fk: string; parentPk: string };
  storage?: { bucket: string; pathColumn: string };
};

const LOG_TYPE_CONFIG: Record<string, LogTypeConfig> = {
  extraction_logs: { table: "extraction_logs", dateColumn: "created_at" },
  workflow_execution_logs: {
    table: "workflow_execution_logs",
    dateColumn: "created_at",
    child: {
      table: "workflow_step_logs",
      fk: "workflow_execution_log_id",
      parentPk: "id",
    },
  },
  email_polling_logs: { table: "email_polling_logs", dateColumn: "created_at" },
  processed_emails: { table: "processed_emails", dateColumn: "processed_at" },
  sftp_polling_logs: { table: "sftp_polling_logs", dateColumn: "created_at" },
  driver_checkin_logs: {
    table: "driver_checkin_logs",
    dateColumn: "created_at",
    child: {
      table: "driver_checkin_documents",
      fk: "checkin_log_id",
      parentPk: "id",
    },
  },
  inbox_accepted: {
    table: "inbox_items",
    dateColumn: "resolved_at",
    status: "accepted",
  },
  inbox_rejected: {
    table: "inbox_items",
    dateColumn: "resolved_at",
    status: "rejected",
  },
  email_processing_queue: {
    table: "email_processing_queue",
    dateColumn: "processed_at",
    statusIn: ["processed", "failed"],
    storage: { bucket: "email-processing-pdfs", pathColumn: "storage_path" },
  },
};

const ALLOWED_LOG_TYPES = Object.keys(LOG_TYPE_CONFIG);

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const action = body?.action ?? "purge";

    if (action === "usage") {
      const retentionDays = typeof body?.retentionDays === "number" && body.retentionDays >= 1
        ? body.retentionDays
        : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);
      const cutoffIso = cutoff.toISOString();

      const { data: usageRows, error: usageError } = await supabase.rpc(
        "get_log_table_usage",
        { cutoff_date: cutoffIso }
      );
      if (usageError) {
        console.error("get_log_table_usage error:", usageError);
        return new Response(
          JSON.stringify({ error: usageError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let storageBytes = 0;
      let expiredStorageBytes = 0;
      try {
        const queueCfg = LOG_TYPE_CONFIG.email_processing_queue;
        if (queueCfg?.storage) {
          const { data: allRows } = await supabase
            .from(queueCfg.table)
            .select(`${queueCfg.storage.pathColumn}, ${queueCfg.dateColumn}`)
            .in("status", queueCfg.statusIn ?? []);
          if (allRows) {
            const paths = allRows
              .map((r: Record<string, unknown>) => r[queueCfg.storage!.pathColumn] as string | null)
              .filter((p): p is string => !!p);
            const byPath = new Map<string, number>();
            const folderCache = new Map<string, Array<{ name: string; metadata: { size?: number } | null }>>();
            for (const p of paths) {
              const slash = p.lastIndexOf("/");
              const folder = slash >= 0 ? p.slice(0, slash) : "";
              const name = slash >= 0 ? p.slice(slash + 1) : p;
              if (!folderCache.has(folder)) {
                const { data: list } = await supabase.storage
                  .from(queueCfg.storage.bucket)
                  .list(folder, { limit: 1000 });
                folderCache.set(folder, (list ?? []) as any);
              }
              const entry = folderCache.get(folder)!.find((f) => f.name === name);
              const size = entry?.metadata?.size ?? 0;
              byPath.set(p, size);
            }
            for (const r of allRows) {
              const path = r[queueCfg.storage.pathColumn] as string | null;
              if (!path) continue;
              const size = byPath.get(path) ?? 0;
              storageBytes += size;
              const rowDate = r[queueCfg.dateColumn] as string | null;
              if (rowDate && new Date(rowDate) < cutoff) {
                expiredStorageBytes += size;
              }
            }
          }
        }
      } catch (e) {
        console.error("storage bucket sizing error:", e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          cutoff: cutoffIso,
          retentionDays,
          usage: usageRows,
          storage: {
            email_processing_queue: {
              bucket: "email-processing-pdfs",
              storageBytes,
              expiredStorageBytes,
            },
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { logTypes, retentionDays } = body;

    if (
      !Array.isArray(logTypes) ||
      logTypes.length === 0 ||
      typeof retentionDays !== "number" ||
      retentionDays < 1
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid request. Provide logTypes array and retentionDays.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validTypes = logTypes.filter((t: string) =>
      ALLOWED_LOG_TYPES.includes(t)
    ) as string[];

    if (validTypes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid log types provided." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    const deleted: Record<string, number> = {};

    for (const logType of validTypes) {
      const config = LOG_TYPE_CONFIG[logType];
      const { table, dateColumn, status, statusIn, child, storage } = config;

      if (child) {
        let parentQuery = supabase
          .from(table)
          .select(child.parentPk)
          .lt(dateColumn, cutoffIso);
        if (status) parentQuery = parentQuery.eq("status", status);
        if (statusIn) parentQuery = parentQuery.in("status", statusIn);

        const { data: parentRows } = await parentQuery;

        if (parentRows && parentRows.length > 0) {
          const parentIds = parentRows.map(
            (r: Record<string, string>) => r[child.parentPk]
          );

          await supabase.from(child.table).delete().in(child.fk, parentIds);
        }
      }

      if (storage) {
        let pathQuery = supabase
          .from(table)
          .select(storage.pathColumn)
          .lt(dateColumn, cutoffIso);
        if (status) pathQuery = pathQuery.eq("status", status);
        if (statusIn) pathQuery = pathQuery.in("status", statusIn);

        const { data: pathRows, error: pathError } = await pathQuery;
        if (pathError) {
          console.error(`Error listing storage paths for ${logType}:`, pathError);
        } else if (pathRows && pathRows.length > 0) {
          const paths = pathRows
            .map((r: Record<string, string>) => r[storage.pathColumn])
            .filter((p: string | null): p is string => !!p);
          const BATCH = 100;
          for (let i = 0; i < paths.length; i += BATCH) {
            const chunk = paths.slice(i, i + BATCH);
            const { error: rmErr } = await supabase.storage
              .from(storage.bucket)
              .remove(chunk);
            if (rmErr) {
              console.error(
                `Error deleting ${chunk.length} object(s) from bucket ${storage.bucket}:`,
                rmErr
              );
            }
          }
        }
      }

      let deleteQuery = supabase.from(table).delete().lt(dateColumn, cutoffIso);
      if (status) deleteQuery = deleteQuery.eq("status", status);
      if (statusIn) deleteQuery = deleteQuery.in("status", statusIn);

      const { data, error } = await deleteQuery.select("id");

      if (error) {
        console.error(`Error purging ${logType}:`, error);
        deleted[logType] = -1;
      } else {
        deleted[logType] = data?.length ?? 0;
      }
    }

    return new Response(JSON.stringify({ success: true, deleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Purge logs error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
