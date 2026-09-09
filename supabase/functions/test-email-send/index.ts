import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TestEmailRequest {
  testToEmail: string;
  testSubject: string;
  testBody: string;
}

async function verifyAdmin(req: Request): Promise<void> {
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
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_admin) {
    throw new Error("FORBIDDEN");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    await verifyAdmin(req);

    const { testToEmail, testSubject, testBody }: TestEmailRequest =
      await req.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!testToEmail || !emailRegex.test(testToEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing recipient email address" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!testSubject || !testBody) {
      return new Response(
        JSON.stringify({ error: "Subject and body are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: emailConfigs, error: configError } = await supabase
      .from("email_monitoring_config")
      .select("*");

    if (configError || !emailConfigs || emailConfigs.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "No email configuration found. Please save your email settings before testing.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailConfig = emailConfigs[0];

    if (!emailConfig.default_send_from_email) {
      return new Response(
        JSON.stringify({
          error:
            'Default Send From Email is not configured. Please save your email settings first.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (emailConfig.provider === "office365") {
      return await sendTestEmailOffice365(emailConfig, testToEmail, testSubject, testBody);
    } else if (emailConfig.provider === "gmail") {
      return await sendTestEmailGmail(emailConfig, testToEmail, testSubject, testBody);
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid or unsupported email provider in saved configuration" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (error.message === "FORBIDDEN") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.error("Test email send error:", error);

    return new Response(
      JSON.stringify({
        error: "Test email send failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function sendTestEmailOffice365(
  emailConfig: any,
  testToEmail: string,
  testSubject: string,
  testBody: string
): Promise<Response> {
  const { tenant_id, client_id, client_secret, default_send_from_email } = emailConfig;

  if (!tenant_id || !client_id || !client_secret) {
    throw new Error(
      "Missing required Office 365 fields in saved configuration: Tenant ID, Client ID, or Client Secret"
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(
      `Failed to get Office 365 access token: ${tokenData.error_description || tokenData.error}`
    );
  }

  const emailMessage = {
    message: {
      subject: testSubject,
      body: {
        contentType: "Text",
        content: testBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: testToEmail,
          },
        },
      ],
      from: {
        emailAddress: {
          address: default_send_from_email,
        },
      },
    },
  };

  const graphUrl = `https://graph.microsoft.com/v1.0/users/${default_send_from_email}/sendMail`;

  const graphResponse = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailMessage),
  });

  if (!graphResponse.ok) {
    const graphResponseText = await graphResponse.text();
    let errorDetails = graphResponseText;
    try {
      const errorData = JSON.parse(graphResponseText);
      errorDetails =
        errorData.error?.message ||
        errorData.error_description ||
        graphResponseText;
    } catch {
      // Use raw response
    }
    throw new Error(
      `Microsoft Graph API error (${graphResponse.status}): ${errorDetails}`
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Test email sent successfully from ${default_send_from_email} to ${testToEmail}`,
      provider: "office365",
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function sendTestEmailGmail(
  emailConfig: any,
  testToEmail: string,
  testSubject: string,
  testBody: string
): Promise<Response> {
  const {
    gmail_client_id,
    gmail_client_secret,
    gmail_refresh_token,
    default_send_from_email,
  } = emailConfig;

  if (!gmail_client_id || !gmail_client_secret || !gmail_refresh_token) {
    throw new Error(
      "Missing required Gmail fields in saved configuration: Client ID, Client Secret, or Refresh Token"
    );
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: gmail_client_id,
      client_secret: gmail_client_secret,
      refresh_token: gmail_refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(
      `Failed to refresh Gmail access token: ${tokenData.error_description || tokenData.error}`
    );
  }

  const emailLines = [
    `To: ${testToEmail}`,
    `From: ${default_send_from_email}`,
    `Subject: ${testSubject}`,
    "",
    testBody,
  ];
  const emailMessage = emailLines.join("\r\n");
  const encodedMessage = btoa(emailMessage)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const gmailResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    }
  );

  if (!gmailResponse.ok) {
    const gmailResponseData = await gmailResponse.json();
    throw new Error(
      `Gmail API error (${gmailResponse.status}): ${JSON.stringify(gmailResponseData)}`
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Test email sent successfully from ${default_send_from_email} to ${testToEmail}`,
      provider: "gmail",
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
