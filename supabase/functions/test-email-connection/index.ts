import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

interface TestRequest {
  provider: 'office365' | 'gmail'
  // Office 365 fields
  tenantId?: string
  clientId?: string
  clientSecret?: string
  monitoredEmail?: string
  // Gmail fields
  gmailClientId?: string
  gmailClientSecret?: string
  gmailRefreshToken?: string
  gmailMonitoredLabel?: string
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

    const requestData: TestRequest = await req.json()
    const { provider } = requestData

    if (provider === 'office365') {
      return await testOffice365Connection(requestData)
    } else if (provider === 'gmail') {
      return await testGmailConnection(requestData)
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid provider specified" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

  } catch (error) {
    console.error("Email connection test error:", error)
    
    return new Response(
      JSON.stringify({ 
        error: "Connection test failed", 
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})

async function testOffice365Connection(requestData: TestRequest): Promise<Response> {
  const { tenantId, clientId, clientSecret, monitoredEmail } = requestData

  // Validate required fields
  if (!tenantId || !clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: "Missing required Office 365 fields" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }

  // Step 1: Get access token from Microsoft Graph
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString()
  })

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.json()
    throw new Error(`Authentication failed: ${tokenError.error_description || tokenError.error}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  // Step 2: Test connection by getting user info or mailbox info
  let testUrl = 'https://graph.microsoft.com/v1.0/me'
  
  // If a specific email is provided, try to access that mailbox
  if (monitoredEmail && monitoredEmail.trim()) {
    // First try to get the user by email
    const userUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(monitoredEmail)}`
    
    const userResponse = await fetch(userUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (userResponse.ok) {
      // If user exists, try to access their mailbox
      testUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(monitoredEmail)}/messages?$top=1`
    }
  }

  const testResponse = await fetch(testUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!testResponse.ok) {
    const testError = await testResponse.json()
    throw new Error(`API access failed: ${testError.error?.message || 'Unknown error'}`)
  }

  const testData = await testResponse.json()
  
  // Count emails if we're testing mailbox access
  let emailCount = 0
  if (testData.value && Array.isArray(testData.value)) {
    emailCount = testData.value.length
  }

  // Step 3: Test specific permissions by trying to access messages
  if (monitoredEmail) {
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(monitoredEmail)}/messages?$top=5&$select=id,subject,from,receivedDateTime,hasAttachments`
    
    const messagesResponse = await fetch(messagesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (messagesResponse.ok) {
      const messagesData = await messagesResponse.json()
      emailCount = messagesData.value ? messagesData.value.length : 0
    }
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Office 365 connection successful",
      emailCount: emailCount,
      monitoredEmail: monitoredEmail || 'Current user'
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
}

async function testGmailConnection(requestData: TestRequest): Promise<Response> {
  const { gmailClientId, gmailClientSecret, gmailRefreshToken, gmailMonitoredLabel } = requestData

  // Validate required fields
  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
    return new Response(
      JSON.stringify({ error: "Missing required Gmail fields" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }

  // Step 1: Get access token using refresh token
  const tokenUrl = 'https://oauth2.googleapis.com/token'
  
  const tokenParams = new URLSearchParams({
    client_id: gmailClientId,
    client_secret: gmailClientSecret,
    refresh_token: gmailRefreshToken,
    grant_type: 'refresh_token'
  })

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString()
  })

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.json()
    throw new Error(`Gmail authentication failed: ${tokenError.error_description || tokenError.error}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  // Step 2: Test connection by getting user profile
  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!profileResponse.ok) {
    const profileError = await profileResponse.json()
    throw new Error(`Gmail API access failed: ${profileError.error?.message || 'Unknown error'}`)
  }

  const profileData = await profileResponse.json()

  // Step 3: Test label access and get message count
  let emailCount = 0
  let labelExists = false
  const monitoredLabel = gmailMonitoredLabel || 'INBOX'

  try {
    // Get all labels to verify the monitored label exists
    const labelsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (labelsResponse.ok) {
      const labelsData = await labelsResponse.json()
      const labels = labelsData.labels || []
      
      // Check if the monitored label exists
      labelExists = labels.some((label: any) => 
        label.name === monitoredLabel || label.id === monitoredLabel
      )

      if (labelExists) {
        // Get recent messages from the monitored label
        const labelQuery = monitoredLabel === 'INBOX' ? 'in:inbox' : `label:${monitoredLabel}`
        const messagesUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(labelQuery + ' has:attachment')}&maxResults=5`
        
        const messagesResponse = await fetch(messagesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json()
          emailCount = messagesData.messages ? messagesData.messages.length : 0
        }
      }
    }
  } catch (labelError) {
    console.warn('Could not test label access:', labelError)
    // Don't fail the entire test if label checking fails
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Gmail connection successful",
      emailCount: emailCount,
      monitoredEmail: profileData.emailAddress,
      labelExists: labelExists,
      monitoredLabel: monitoredLabel
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
}