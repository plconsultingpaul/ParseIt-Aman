import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.7";

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

export type RateLimitResult = { allowed: boolean; retryAfterSec: number; remaining: number };

export async function checkRateLimit(
  supabase: SupabaseClient,
  ip: string,
  endpoint: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - windowSec * 1000).toISOString();

  const { data: existing } = await supabase
    .from("guest_payment_rate_limits")
    .select("id, window_start, count")
    .eq("ip_address", ip)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (!existing || existing.window_start < cutoff) {
    await supabase
      .from("guest_payment_rate_limits")
      .upsert(
        { ip_address: ip, endpoint, window_start: nowIso, count: 1 },
        { onConflict: "ip_address,endpoint" },
      );
    return { allowed: true, retryAfterSec: 0, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    const windowEnd = new Date(new Date(existing.window_start).getTime() + windowSec * 1000);
    const retryAfterSec = Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0 };
  }

  await supabase
    .from("guest_payment_rate_limits")
    .update({ count: existing.count + 1 })
    .eq("id", existing.id);
  return { allowed: true, retryAfterSec: 0, remaining: limit - existing.count - 1 };
}

export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    },
  );
}
