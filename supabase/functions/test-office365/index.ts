import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

interface TestRequest {
  mode?: 'send' | 'monitoring'
  provider?: 'office365' | 'gmail'
  tenantId?: string
  clientId?: string
  clientSecret?: string
  monitoredEmail?: string
  defaultSendFromEmail?: string
  gmailClientId?: string
  gmailClientSecret?: string
  gmailRefreshToken?: string
}

async function testOffice365Send(tenantId: string, clientId: string, clientSecret: string, sendFromEmail?: string) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  })

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.json()
    throw new Error(`Authentication failed: ${tokenError.error_description || tokenError.error}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  if (sendFromEmail) {
    const userUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sendFromEmail)}`
    const userResponse = await fetch(userUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!userResponse.ok) {
      throw new Error(`Cannot access mailbox for ${sendFromEmail}. Ensure the app has Mail.Send permission.`)
    }
  }

  return {
    success: true,
    message: sendFromEmail
      ? `Send credentials verified. Can send as ${sendFromEmail}`
      : 'Send credentials verified successfully'
  }
}

async function testGmailSend(clientId: string, clientSecret: string, refreshToken: string) {
  const tokenUrl = 'https://oauth2.googleapis.com/token'

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  })

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.json()
    throw new Error(`Gmail authentication failed: ${tokenError.error_description || tokenError.error}`)
  }

  return {
    success: true,
    message: 'Gmail send credentials verified successfully'
  }
}

async function testOffice365Monitoring(tenantId: string, clientId: string, clientSecret: string, monitoredEmail?: string) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  })

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.json()
    throw new Error(`Authentication failed: ${tokenError.error_description || tokenError.error}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  let emailCount = 0

  if (monitoredEmail && monitoredEmail.trim()) {
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(monitoredEmail)}/mailFolders/Inbox/messages?$top=5&$filter=hasAttachments eq true and isRead eq false&$select=id,subject,from,receivedDateTime,hasAttachments`

    const messagesResponse = await fetch(messagesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!messagesResponse.ok) {
      const msgError = await messagesResponse.json()
      throw new Error(`Cannot read mailbox ${monitoredEmail}: ${msgError.error?.message || 'Unknown error'}`)
    }

    const messagesData = await messagesResponse.json()
    emailCount = messagesData.value ? messagesData.value.length : 0
  }

  return {
    success: true,
    message: "Monitoring connection successful",
    emailCount: emailCount,
    monitoredEmail: monitoredEmail || 'Current user'
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    const callerToken = authHeader.replace("Bearer ", "")
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
    )
    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const body: TestRequest = await req.json()
    const mode = body.mode || 'monitoring'
    const provider = body.provider || 'office365'

    if (mode === 'send') {
      if (provider === 'gmail') {
        if (!body.gmailClientId || !body.gmailClientSecret || !body.gmailRefreshToken) {
          return new Response(
            JSON.stringify({ error: "Missing Gmail credentials" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          )
        }
        const result = await testGmailSend(body.gmailClientId, body.gmailClientSecret, body.gmailRefreshToken)
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      } else {
        if (!body.tenantId || !body.clientId || !body.clientSecret) {
          return new Response(
            JSON.stringify({ error: "Missing Office 365 credentials" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          )
        }
        const result = await testOffice365Send(body.tenantId, body.clientId, body.clientSecret, body.defaultSendFromEmail)
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    } else {
      if (!body.tenantId || !body.clientId || !body.clientSecret) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
      const result = await testOffice365Monitoring(body.tenantId, body.clientId, body.clientSecret, body.monitoredEmail)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

  } catch (error) {
    console.error("Test error:", error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Connection test failed"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})