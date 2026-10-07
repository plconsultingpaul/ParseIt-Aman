import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import Stripe from "npm:stripe@14.21.0";
import {
  type ApiEndpoint,
  buildResolvedRequest,
  hasEndpointConfigured,
  interpolate,
} from "../_shared/guestPaymentEndpoint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, stripe-signature",
};

async function callSuccessApi(
  supabase: ReturnType<typeof createClient>,
  ep: ApiEndpoint,
  scope: Record<string, unknown>,
) {
  const built = await buildResolvedRequest(supabase, ep, scope);
  const init: RequestInit = { method: built.method, headers: built.headers };
  if (built.body !== undefined) init.body = built.body;
  const res = await fetch(built.url, init);
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  return { status: res.status, ok: res.ok, response: parsed };
}

type ResolvedEmail = {
  provider: "office365" | "gmail";
  fromEmail: string;
  office365?: { tenant_id: string; client_id: string; client_secret: string };
  gmail?: { client_id: string; client_secret: string; refresh_token: string };
};

async function resolveEmailAccount(
  supabase: ReturnType<typeof createClient>,
  sendingAccountId: string | null,
): Promise<ResolvedEmail | { error: string }> {
  if (sendingAccountId) {
    const { data } = await supabase
      .from("email_sending_accounts")
      .select("*")
      .eq("id", sendingAccountId)
      .maybeSingle();
    if (data) return mapAccount(data);
  }
  const { data: def } = await supabase
    .from("email_sending_accounts")
    .select("*")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  if (def) return mapAccount(def);

  const { data: monitor } = await supabase
    .from("email_monitoring_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (!monitor) return { error: "No email sending account or monitoring config found" };
  const provider = (monitor.provider as string) || "office365";
  if (provider === "gmail") {
    return {
      provider: "gmail",
      fromEmail: (monitor.default_send_from_email as string) || "",
      gmail: {
        client_id: (monitor.gmail_client_id as string) || "",
        client_secret: (monitor.gmail_client_secret as string) || "",
        refresh_token: (monitor.gmail_refresh_token as string) || "",
      },
    };
  }
  return {
    provider: "office365",
    fromEmail: (monitor.default_send_from_email as string) || "",
    office365: {
      tenant_id: (monitor.tenant_id as string) || "",
      client_id: (monitor.client_id as string) || "",
      client_secret: (monitor.client_secret as string) || "",
    },
  };
}

function mapAccount(a: Record<string, unknown>): ResolvedEmail {
  const provider = (a.provider as string) === "gmail" ? "gmail" : "office365";
  if (provider === "gmail") {
    return {
      provider: "gmail",
      fromEmail: (a.from_email as string) || "",
      gmail: {
        client_id: (a.gmail_client_id as string) || "",
        client_secret: (a.gmail_client_secret as string) || "",
        refresh_token: (a.gmail_refresh_token as string) || "",
      },
    };
  }
  return {
    provider: "office365",
    fromEmail: (a.from_email as string) || "",
    office365: {
      tenant_id: (a.tenant_id as string) || "",
      client_id: (a.client_id as string) || "",
      client_secret: (a.client_secret as string) || "",
    },
  };
}

async function getOffice365Token(c: { tenant_id: string; client_id: string; client_secret: string }): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${c.tenant_id}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client_id,
      client_secret: c.client_secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Office365 token failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function sendOffice365(
  c: { tenant_id: string; client_id: string; client_secret: string },
  msg: { to: string; from: string; subject: string; html: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getOffice365Token(c);
    const parse = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean).map((address) => ({ emailAddress: { address } }));
    const body = {
      message: {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.html },
        toRecipients: parse(msg.to),
        from: { emailAddress: { address: msg.from } },
      },
      saveToSentItems: "true",
    };
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${msg.from}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { success: false, error: await res.text() };
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function getGmailToken(c: { client_id: string; client_secret: string; refresh_token: string }): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client_id,
      client_secret: c.client_secret,
      refresh_token: c.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Gmail token failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function sendGmail(
  c: { client_id: string; client_secret: string; refresh_token: string },
  msg: { to: string; from: string; subject: string; html: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getGmailToken(c);
    const raw = [
      `From: ${msg.from}`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      msg.html,
    ].join("\r\n");
    const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!res.ok) return { success: false, error: await res.text() };
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildReceiptHtml(
  bodyTemplate: string,
  scope: Record<string, unknown>,
  bills: Array<{ bill_number: string; amount: number }>,
  currency: string,
  total: number,
  surcharge: { subtotal: number; amount: number; percent: number },
): string {
  const intro = interpolate(bodyTemplate || "Thank you for your payment.", scope);
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() });
  const rows = bills
    .map(
      (b) =>
        `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;">Bill ${escapeHtml(String(b.bill_number))}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;">${escapeHtml(fmt.format(Number(b.amount) || 0))}</td></tr>`,
    )
    .join("");
  const introHtml = /<\/?[a-z][\s\S]*?>/i.test(intro) ? intro : escapeHtml(intro).replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5;">
    <p>${introHtml}</p>
    <table style="border-collapse:collapse;margin-top:16px;">
      <thead><tr>
        <th style="padding:6px 12px;border:1px solid #e5e7eb;background:#f9fafb;text-align:left;">Bill Number</th>
        <th style="padding:6px 12px;border:1px solid #e5e7eb;background:#f9fafb;text-align:right;">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${surcharge.amount > 0 ? `<tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">Selected Payment</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;">${escapeHtml(fmt.format(surcharge.subtotal))}</td>
      </tr><tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">Surcharge ${escapeHtml(String(surcharge.percent))}%</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;">${escapeHtml(fmt.format(surcharge.amount))}</td>
      </tr>` : ""}<tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:600;">Total</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${escapeHtml(fmt.format(total))}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const webhookCompanyId = new URL(req.url).searchParams.get("company_id") ?? "";
  const { data: secrets } = webhookCompanyId
    ? await supabase
        .from("guest_payment_company_stripe_secrets")
        .select("live_secret_key, test_secret_key, live_webhook_secret, test_webhook_secret")
        .eq("company_id", webhookCompanyId)
        .maybeSingle()
    : { data: null };
  if (!secrets) {
    return new Response(JSON.stringify({ error: "Stripe webhook is not configured for this company" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();

  let event: Stripe.Event | null = null;
  const attempts: Array<{ mode: "live" | "test"; secret: string; webhookSecret: string }> = [
    { mode: "live", secret: secrets.live_secret_key ?? "", webhookSecret: secrets.live_webhook_secret ?? "" },
    { mode: "test", secret: secrets.test_secret_key ?? "", webhookSecret: secrets.test_webhook_secret ?? "" },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    if (!attempt.secret || !attempt.webhookSecret) continue;
    try {
      const s = new Stripe(attempt.secret, { apiVersion: "2023-10-16" });
      event = await s.webhooks.constructEventAsync(rawBody, signature, attempt.webhookSecret);
      break;
    } catch (err) {
      errors.push(`${attempt.mode}: ${(err as Error).message}`);
    }
  }
  if (!event) {
    return new Response(JSON.stringify({ error: `Invalid signature: ${errors.join(" | ")}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
      let transactionId: string | undefined;
      let sessionId: string | undefined;
      let paymentIntentId: string | undefined;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        transactionId = session.metadata?.transaction_id ?? undefined;
        sessionId = session.id;
        paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      } else {
        const pi = event.data.object as Stripe.PaymentIntent;
        transactionId = pi.metadata?.transaction_id ?? undefined;
        paymentIntentId = pi.id;
      }

      if (!transactionId) {
        return new Response(JSON.stringify({ received: true, note: "no transaction_id" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: claimed } = await supabase
        .from("guest_payment_transactions")
        .update({
          status: "paid",
          stripe_payment_intent_id: paymentIntentId ?? null,
          webhook_payload: event as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .eq("company_id", webhookCompanyId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

      if (!claimed) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: config } = await supabase
        .from("guest_payment_config")
        .select("default_company_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const resolvedCompanyId = (claimed.company_id as string | null) ?? (config?.default_company_id as string | null) ?? null;

      const { data: company } = resolvedCompanyId
        ? await supabase
            .from("guest_payment_companies")
            .select("success_api_call, receipt_subject_template, receipt_body_template, receipt_sending_account_id, receipt_to_email, receipt_from_email")
            .eq("id", resolvedCompanyId)
            .maybeSingle()
        : { data: null };

      const bills = (claimed.selected_bills ?? []) as Array<{ bill_number: string; amount: number; snapshot: Record<string, unknown> }>;
      const successApi = (company?.success_api_call ?? {}) as ApiEndpoint;
      const results: Array<Record<string, unknown>> = [];

      if (hasEndpointConfigured(successApi)) {
        for (const bill of bills) {
          const scope = {
            bill_number: bill.bill_number,
            amount: bill.amount,
            guest_email: claimed.guest_email,
            transaction_id: claimed.id,
            currency: claimed.currency,
            stripe_session_id: sessionId ?? claimed.stripe_session_id,
            stripe_payment_intent_id: paymentIntentId ?? "",
            bill: bill.snapshot ?? {},
          };
          try {
            const out = await callSuccessApi(supabase, successApi, scope);
            results.push({
              bill_number: bill.bill_number,
              status: out.ok ? "ok" : "error",
              http_status: out.status,
              response: out.response,
              attempted_at: new Date().toISOString(),
            });
          } catch (e) {
            results.push({
              bill_number: bill.bill_number,
              status: "error",
              error: (e as Error).message,
              attempted_at: new Date().toISOString(),
            });
          }
        }
      }

      const emailScope = {
        guest_email: claimed.guest_email,
        total_amount: claimed.total_amount,
        subtotal_amount: claimed.subtotal_amount ?? claimed.total_amount,
        surcharge_amount: claimed.surcharge_amount ?? 0,
        surcharge_percent: claimed.surcharge_percent ?? 0,
        currency: claimed.currency,
        transaction_id: claimed.id,
      };
      const subject = interpolate(company?.receipt_subject_template || "Your payment receipt", emailScope);
      const html = buildReceiptHtml(
        company?.receipt_body_template ?? "",
        emailScope,
        bills,
        claimed.currency,
        Number(claimed.total_amount),
        {
          subtotal: Number(claimed.subtotal_amount ?? claimed.total_amount) || 0,
          amount: Number(claimed.surcharge_amount) || 0,
          percent: Number(claimed.surcharge_percent) || 0,
        },
      );
      const to = interpolate(company?.receipt_to_email || "{guest_email}", emailScope) || claimed.guest_email;

      let emailResult: { sent: boolean; provider?: string; error?: string } = { sent: false, error: "Not attempted" };
      const resolved = await resolveEmailAccount(supabase, (company?.receipt_sending_account_id as string | null) ?? null);
      if ("error" in resolved) {
        emailResult = { sent: false, error: resolved.error };
      } else {
        const from = interpolate(company?.receipt_from_email || "", emailScope) || resolved.fromEmail;
        if (!from) {
          emailResult = { sent: false, provider: resolved.provider, error: "No from address configured on sending account" };
        } else if (resolved.provider === "office365") {
          const r = await sendOffice365(resolved.office365!, { to, from, subject, html });
          emailResult = { sent: r.success, provider: "office365", error: r.error };
        } else {
          const r = await sendGmail(resolved.gmail!, { to, from, subject, html });
          emailResult = { sent: r.success, provider: "gmail", error: r.error };
        }
      }

      await supabase
        .from("guest_payment_transactions")
        .update({
          success_api_results: results,
          receipt_sent_at: emailResult.sent ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);

      return new Response(JSON.stringify({ received: true, results, email: emailResult }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      const tid = s.metadata?.transaction_id;
      if (tid) {
        await supabase
          .from("guest_payment_transactions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", tid)
          .eq("status", "pending");
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const tid = pi.metadata?.transaction_id;
      if (tid) {
        await supabase
          .from("guest_payment_transactions")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", tid)
          .eq("status", "pending");
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("guest-payment-webhook error", err);
    return new Response(JSON.stringify({ received: true, error: (err as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
