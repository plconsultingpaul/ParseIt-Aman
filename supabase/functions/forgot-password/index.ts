import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EmailConfig {
  provider: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  default_send_from_email?: string;
  gmail_client_id?: string;
  gmail_client_secret?: string;
  gmail_refresh_token?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { username, userType } = await req.json();

    if (!username || !userType) {
      return new Response(
        JSON.stringify({ error: 'Username and userType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const role = userType === 'admin' ? 'admin' : 'client';
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('username', username)
      .eq('role', role)
      .maybeSingle();

    if (!user || userError) {
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists, a password reset link has been sent to the associated email.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: resetToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
      })
      .select('token')
      .single();

    if (tokenError || !resetToken) {
      throw new Error('Failed to create reset token');
    }

    const templateType = userType === 'admin' ? 'admin_reset_password' : 'client_reset_password';
    const { data: template } = await supabase
      .from('password_reset_templates')
      .select('subject, body')
      .eq('template_type', templateType)
      .single();

    if (!template) {
      throw new Error('Email template not found');
    }

    const { data: branding } = await supabase
      .from('company_branding')
      .select('app_base_url')
      .limit(1)
      .maybeSingle();

    const appBaseUrl = branding?.app_base_url;
    if (!appBaseUrl) {
      throw new Error('Application base URL is not configured. Please set it in Company Branding settings.');
    }

    const baseUrl = appBaseUrl.replace(/\/+$/, '');
    const resetLink = `${baseUrl}/reset-password?token=${resetToken.token}&type=${userType}`;
    const emailBody = template.body.replace('{{reset_link}}', resetLink);

    const { data: emailConfigs, error: configError } = await supabase
      .from('email_monitoring_config')
      .select('*');

    if (configError || !emailConfigs || emailConfigs.length === 0) {
      throw new Error('No email configuration found');
    }

    const emailConfig: EmailConfig = emailConfigs[0];
    let emailSent = false;

    if (emailConfig.provider === 'office365') {
      const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${emailConfig.tenant_id}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: emailConfig.client_id!,
            client_secret: emailConfig.client_secret!,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
          }),
        }
      );

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Office 365 access token');
      }

      const { access_token } = await tokenResponse.json();

      const sendEmailResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${emailConfig.default_send_from_email}/sendMail`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject: template.subject,
              body: {
                contentType: 'HTML',
                content: emailBody,
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: user.email,
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
    } else if (emailConfig.provider === 'gmail') {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: emailConfig.gmail_client_id!,
          client_secret: emailConfig.gmail_client_secret!,
          refresh_token: emailConfig.gmail_refresh_token!,
          grant_type: 'refresh_token',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Gmail access token');
      }

      const { access_token } = await tokenResponse.json();

      const rawEmail = createRawEmail(
        emailConfig.default_send_from_email!,
        user.email,
        template.subject,
        emailBody
      );

      const sendEmailResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
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
      throw new Error('Unsupported email provider');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'If an account exists, a password reset link has been sent to the associated email.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in forgot-password function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].join('\r\n');

  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}