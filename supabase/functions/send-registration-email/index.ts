import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  userId: string;
  templateType?: "admin" | "client";
}

interface InvitationTemplate {
  subject: string;
  body_html: string;
}

interface CallerInfo {
  isSystemAdmin: boolean;
  isClientAdmin: boolean;
  clientId: string | null;
}

async function verifyCaller(req: Request): Promise<CallerInfo> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("is_admin, is_client_admin, client_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("FORBIDDEN");
  }

  if (!profile.is_admin && !profile.is_client_admin) {
    throw new Error("FORBIDDEN");
  }

  return {
    isSystemAdmin: profile.is_admin || false,
    isClientAdmin: profile.is_client_admin || false,
    clientId: profile.client_id || null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const caller = await verifyCaller(req);
    console.log("[send-registration-email] Auth passed:", { isSystemAdmin: caller.isSystemAdmin, isClientAdmin: caller.isClientAdmin, clientId: caller.clientId });

    const { userId, templateType = "admin" }: RequestBody = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing required field: userId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id, email, username, name, invitation_sent_count, client_id")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !targetUser) {
      console.log("[send-registration-email] User not found:", { userId, userError });
      return new Response(
        JSON.stringify({
          success: false,
          message: "User not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!caller.isSystemAdmin && caller.isClientAdmin) {
      if (!caller.clientId || targetUser.client_id !== caller.clientId) {
        console.log("[send-registration-email] Scope check failed:", { callerClientId: caller.clientId, targetClientId: targetUser.client_id });
        return new Response(
          JSON.stringify({
            success: false,
            message: "You can only send registration emails to users within your organization",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    console.log("[send-registration-email] Sending to:", { email: targetUser.email, username: targetUser.username });

    if (!targetUser.email) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "User does not have an email address configured",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const displayName = targetUser.name || targetUser.username || "there";

    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const { error: tokenError } = await supabase
      .from("user_registration_tokens")
      .insert({
        user_id: userId,
        token: token,
        expires_at: expiresAt.toISOString(),
        is_used: false,
        created_at: new Date().toISOString(),
      });

    if (tokenError) {
      throw new Error(`Failed to create token: ${tokenError.message}`);
    }

    const { data: emailConfigs, error: configError } = await supabase
      .from("email_monitoring_config")
      .select("*");

    if (configError || !emailConfigs || emailConfigs.length === 0) {
      throw new Error("No email configuration found. Please configure email settings first.");
    }

    const emailConfig = emailConfigs[0];
    console.log("[send-registration-email] Email provider:", emailConfig.provider);

    const { data: branding } = await supabase
      .from("company_branding")
      .select("app_base_url, company_name")
      .limit(1)
      .maybeSingle();

    const appBaseUrl = branding?.app_base_url?.trim();
    if (!appBaseUrl) {
      throw new Error(
        "Application base URL is not configured. Please set it in Company Branding settings before sending invitation emails."
      );
    }

    const baseUrl = appBaseUrl.replace(/\/+$/, "");
    const registrationUrl = `${baseUrl}/password-setup?token=${token}`;
    const companyName = branding?.company_name || "Order Entry";

    const template = await loadInvitationTemplate(
      supabase,
      templateType
    );

    const emailSubject = replaceTemplateVariables(template.subject, {
      name: displayName,
      username: targetUser.username || "there",
      reset_link: registrationUrl,
      company_name: companyName,
      expiration_hours: "48",
    });

    const emailBody = replaceTemplateVariables(template.body_html, {
      name: displayName,
      username: targetUser.username || "there",
      reset_link: registrationUrl,
      company_name: companyName,
      expiration_hours: "48",
    });

    let emailSent = false;

    if (emailConfig.provider === "office365") {
      const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${emailConfig.tenant_id}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: emailConfig.client_id,
            client_secret: emailConfig.client_secret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials",
          }),
        }
      );

      if (!tokenResponse.ok) {
        throw new Error("Failed to get Office 365 access token");
      }

      const { access_token } = await tokenResponse.json();

      const sendEmailResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${emailConfig.default_send_from_email}/sendMail`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              subject: emailSubject,
              body: {
                contentType: "HTML",
                content: emailBody,
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: targetUser.email,
                  },
                },
              ],
            },
            saveToSentItems: false,
          }),
        }
      );

      if (!sendEmailResponse.ok) {
        const error = await sendEmailResponse.text();
        throw new Error(`Failed to send email: ${error}`);
      }

      emailSent = true;
    } else if (emailConfig.provider === "gmail") {
      const tokenResponse = await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: emailConfig.gmail_client_id,
            client_secret: emailConfig.gmail_client_secret,
            refresh_token: emailConfig.gmail_refresh_token,
            grant_type: "refresh_token",
          }),
        }
      );

      if (!tokenResponse.ok) {
        throw new Error("Failed to get Gmail access token");
      }

      const { access_token } = await tokenResponse.json();

      const rawEmail = createRawEmail(
        emailConfig.default_send_from_email,
        targetUser.email,
        emailSubject,
        emailBody
      );

      const sendEmailResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: rawEmail,
          }),
        }
      );

      if (!sendEmailResponse.ok) {
        const error = await sendEmailResponse.text();
        throw new Error(`Failed to send email: ${error}`);
      }

      emailSent = true;
    }

    if (!emailSent) {
      throw new Error("Unsupported email provider");
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        invitation_sent_at: new Date().toISOString(),
        invitation_sent_count: (targetUser.invitation_sent_count || 0) + 1,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update invitation tracking:", updateError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Registration email sent successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error:", error);

    if (error.message === "UNAUTHORIZED") {
      return new Response(
        JSON.stringify({ success: false, message: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (error.message === "FORBIDDEN") {
      return new Response(
        JSON.stringify({ success: false, message: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to send registration email",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

async function loadInvitationTemplate(
  supabase: any,
  templateType: "admin" | "client" = "admin"
): Promise<InvitationTemplate> {
  try {
    const { data: templates } = await supabase
      .from("invitation_email_templates")
      .select("subject, body_html")
      .eq("is_default", true)
      .eq("template_type", templateType)
      .limit(1);

    if (templates && templates.length > 0) {
      return {
        subject: templates[0].subject,
        body_html: templates[0].body_html,
      };
    }
  } catch (error) {
    console.error("Error loading invitation template:", error);
  }

  return {
    subject: "Complete Your Account Registration",
    body_html: getDefaultEmailHtml(),
  };
}

function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

function getDefaultEmailHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Registration</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #14b8a6 0%, #0891b2 100%); padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                Welcome to {{company_name}}!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hello {{name}},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Your account has been created! To complete your registration and access your account, please set your password by clicking the button below.
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                This link will expire in <strong>{{expiration_hours}} hours</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{{reset_link}}" style="display: inline-block; padding: 16px 32px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(20, 184, 166, 0.3);">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #14b8a6; font-size: 13px; word-break: break-all; margin: 10px 0 0 0;">
                {{reset_link}}
              </p>
              <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 30px 0 0 0;">
                If you didn't request this registration, please ignore this email or contact your administrator.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                {{company_name}}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function createRawEmail(
  from: string,
  to: string,
  subject: string,
  htmlBody: string
): string {
  const email = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\r\n");

  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
