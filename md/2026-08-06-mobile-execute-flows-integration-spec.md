# 2026-08-06 — Parse-It Mobile App: Execute Flows Integration Spec

This document tells the **mobile app team** how to show and run **Execute Flows**
inside the Parse-It mobile app after a user signs in. The recommended approach
reuses the existing web flow experience inside an **in-app WebView** — no external
browser, and no need to re-implement the flow engine natively.

Read this together with the QR connection format doc:
`public/2026-08-06-qr-code-format-parseit-tradeweave.md`.

---

## 1. Concepts

- An **Execute Flow** is a configurable, multi-step form ("Execute button") that
  the operator builds in Parse-It. Each flow can contain multiple steps, grouped
  fields, conditional logic, confirmation prompts, maps, signatures, array
  tables, and API lookups.
- Flows are stored in the `execute_buttons` table (plus related tables for
  groups, fields, and flow nodes/edges).
- Every flow that should appear in the mobile app has:
  - `visible_in_mobile = true`
  - `is_active = true`
  - a non-null `qr_code_slug` (Parse-It guarantees a slug exists whenever
    `visible_in_mobile` is on).
- Each flow is reachable at the web address:
  `https://<your-app-host>/execute/<qr_code_slug>`
  This is the SAME page a QR code opens. Loading it in an in-app WebView is the
  intended integration path.

> The mobile app should NOT try to render the form itself. The flow engine is
> large and evolves frequently; rendering the hosted `/execute/<slug>` page keeps
> the mobile app automatically in sync with every future flow feature.

---

## 2. Connection

The user connects the app by scanning the Parse-It QR code (see the connection
format doc). From it the app obtains:

- `supabaseUrl` — backend URL.
- `supabaseAnonKey` — public anon key (safe to embed; row-level security applies).
- `instanceName` — display name (`"Parse-It"`).
- `application` — `"parse-it"`.

Use `supabaseUrl` + `supabaseAnonKey` to talk to the backend (Supabase). The web
app host used for the WebView is your deployed Parse-It web address (the same
origin that serves `/execute/<slug>`). If the app only has the `supabaseUrl`,
ask the Parse-It operator for the public web host, or store it alongside the
connection.

---

## 3. Sign-in

Execute Flows are shown to a signed-in user. Authenticate with Supabase Auth
(email/password) using the anon key obtained above:

```
POST {supabaseUrl}/auth/v1/token?grant_type=password
apikey: {supabaseAnonKey}
Content-Type: application/json

{ "email": "<user email>", "password": "<user password>" }
```

Store the returned `access_token` and `refresh_token`. Refresh as needed.

---

## 4. Listing the flows to show after login

Query the flows flagged for mobile. Use the Supabase REST endpoint with the
user's access token:

```
GET {supabaseUrl}/rest/v1/execute_buttons
    ?select=id,name,description,qr_code_slug
    &visible_in_mobile=eq.true
    &is_active=eq.true
    &order=sort_order.asc
apikey: {supabaseAnonKey}
Authorization: Bearer {access_token}
```

Response (example):

```json
[
  { "id": "…", "name": "Create Shipment", "description": "Start a new shipment", "qr_code_slug": "3f2a…" },
  { "id": "…", "name": "Report Delay",    "description": null,                    "qr_code_slug": "9b7c…" }
]
```

Render this as a simple list/menu. Each item shows `name` and, if present,
`description`. Handle the empty case (no flows) and the error case (show a retry).

---

## 5. Opening a flow (in-app WebView)

When the user taps a flow, open an in-app WebView pointed at:

```
https://<parse-it-web-host>/execute/{qr_code_slug}
```

Guidelines:

- Use an **embedded WebView**, never the system browser. The page is fully
  responsive and already styled for mobile.
- The page runs the flow end to end: it renders each step, validates input, calls
  the backend to process steps, shows confirmation prompts, and shows the final
  success screen. No additional wiring is required from the app.
- Recommended WebView settings: JavaScript enabled, DOM storage enabled, camera
  permission granted (some flows use document/QR scanning), and file input
  enabled (some flows upload files).
- Keep a visible **Back / Close** control in your native chrome so the user can
  return to the flow list at any time.

### Detecting completion (optional polish)

The success screen is shown inside the page when a flow finishes. If you want the
app to react (e.g. auto-close the WebView and return to the list), watch the
WebView URL/console or add a small bridge with the Parse-It web team. This is
optional — the flow works without it.

---

## 6. What NOT to do

- Do NOT open flows in an external browser tab.
- Do NOT re-implement the form rendering or the step-processing calls natively —
  they are intricate and change often; the WebView keeps you current for free.
- Do NOT use or request a service-role/secret key. Only the anon key + the signed
  in user's token are needed.

---

## 7. Quick checklist

1. Scan QR → store `supabaseUrl`, `supabaseAnonKey`, `instanceName`, `application`.
2. Sign the user in (email/password) → store tokens.
3. `GET execute_buttons` where `visible_in_mobile=true & is_active=true` → show list.
4. On tap → open `https://<parse-it-web-host>/execute/<qr_code_slug>` in a WebView.
5. Provide a native Back/Close button to return to the list.
