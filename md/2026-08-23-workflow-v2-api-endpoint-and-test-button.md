# Workflow v2 — API Endpoint Step + Settings + Test Button

**Date:** 2026-08-23
**Purpose:** Portable reference for rebuilding, in another application, exactly how (1) the Workflow v2 **API Endpoint** step sends its JSON payload and bearer token to the target API, (2) the API Endpoint URL + Authentication are persisted in the **Settings** tab, and (3) the **Test** button verifies the Base URL end-to-end.

---

## 1. How the API Endpoint step sends its payload

The step runs server-side inside the Supabase Edge Function `json-workflow-processor-v2` (module `steps/apiEndpoint.ts`). Every run does the same six things:

### 1.1 Resolve which API source to use

The step's config has a field `apiSourceType` with values:

- `main` (default): use the single-row **`api_settings`** table.
- `secondary`: use the **`secondary_api_configs`** row identified by `config.secondaryApiId`.

The function reads the row via the Supabase REST API using the service role key:

```
GET  {SUPABASE_URL}/rest/v1/api_settings?select=*
GET  {SUPABASE_URL}/rest/v1/secondary_api_configs?id=eq.<id>&select=*
Headers: Authorization: Bearer <SERVICE_ROLE_KEY>, apikey: <SERVICE_ROLE_KEY>
```

From the row it takes:

- `baseUrl`  ← `api_settings.path`   or   `secondary_api_configs.base_url`
- `authToken` ← `api_settings.password`   or   `secondary_api_configs.auth_token`

### 1.2 Resolve the URL

From `step.config_json`:

- `apiPath` — e.g. `/orders/{orderNumber}`.
- `httpMethod` — `GET | POST | PUT | PATCH | DELETE` (default `POST`).
- `pathVariableConfig` — map of `{ [variableName]: template }`. Both `{name}` and `${name}` syntax are supported. Each match is either resolved from a `{{context.path}}` template inside the config value, or by looking up `variableName` directly in the runtime context via `getValueByPath(contextData, variableName)`.
- `queryParameterConfig` — `{ [paramName]: { enabled: boolean, value: string } }`. The `value` supports `{{path}}` and `${path}` placeholders. If the param name is `$filter` (OData), single quotes in resolved values are escaped as `''` and any `)(` between predicates is rewritten to `)-(`.
- `customQueryParameters` — array of `{ key, value }` with the same placeholder syntax.

Final URL:

```
fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`
```

### 1.3 Build the JSON request body

Two mutually-exclusive paths.

**Path A — Field-mapped body (`requestBodyFieldMappings.length > 0`):**

1. Parse `config.requestBodyTemplate` (a JSON string) into `requestBodyData`, or start from `{}`.
2. Fetch every referenced function in one query:
   ```
   GET /rest/v1/field_mapping_functions?id=in.(<ids>)&select=*
   ```
3. For each mapping `{ fieldName, type, value, functionId, dataType }`:
   - `type: 'hardcoded'` → use `value` verbatim.
   - `type: 'variable'` → strip surrounding `{{ }}`, resolve via `getValueByPath(contextData, variable)`.
   - `type: 'function'` → run `evaluateFunction(func.function_logic, contextData.extractedData || contextData)`.
4. Coerce to `dataType`:
   - `integer` → `parseInt`.
   - `number`  → `parseFloat`.
   - `boolean` → `String(v).toLowerCase() === 'true'`.
   - `date`    → keep only the `YYYY-MM-DD` prefix.
   - `datetime` → pad `YYYY-MM-DDTHH:mm` → `:00`; expand `YYYY-MM-DD` → `T00:00:00`.
   - anything else / undefined → `String(v)`.
5. Deep-set the value at `fieldName` (dot-notation) inside `requestBodyData`; `null`/`undefined` values are skipped.
6. `requestBodyContent = JSON.stringify(requestBodyData)`.

**Path B — Template-only body (no mappings):**

Take `config.requestBodyTemplate` as-is and substitute `{{path}}` placeholders with values pulled from `contextData` (objects are JSON-stringified).

**Optional wrap:** if `config.wrapBodyInArray === true` and the body parses to a non-array, the body is re-wrapped as `[obj]`.

### 1.4 Attach the bearer token

The step ALWAYS sets these two headers:

```
Content-Type:  application/json
Authorization: Bearer <authToken>
```

Notes:

- `authToken` is used verbatim — whatever text is stored in `api_settings.password` or `secondary_api_configs.auth_token` becomes what follows `Bearer `.
- The step does not currently branch on auth type — everything is sent as a Bearer.
- The log line prints only the first 10 chars of the token followed by `...`, or `MISSING` if empty.

### 1.5 Send it

```ts
const fetchOptions = { method: httpMethod, headers };
if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent.trim() !== '') {
  fetchOptions.body = requestBodyContent;
}
await fetch(fullUrl, fetchOptions);
```

### 1.6 Handle the response

- Non-2xx → throw with `requestAttempted`, `responseStatus`, and the raw error text attached to `error.outputData`.
- Content-Type `application/pdf`, `application/octet-stream`, `image/*`, or `config.treatResponseAsBinary === true` → decode into `{ _binaryBase64, _contentType, _byteLength }` and stash on `contextData._lastBinaryResponseBase64`.
- Otherwise → parse JSON (falling back to `{ _rawText }`).
- `config.responseDataMappings` (or the legacy `responsePath` + `updateJsonPath`) copy fields from the response into `contextData.extractedData`. Includes single-array auto-unwrap and per-mapping `defaultValue` fallbacks.

---

## 2. How API Endpoint + Authentication are stored in Settings

All persistence is Supabase Postgres. Two tables handle credentials, plus optional schema tables for API Specs.

### 2.1 `api_settings` — Primary API (single row)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `path` | text | **Base URL** — the string prepended to every `apiPath`. e.g. `https://api.example.com/v1`. |
| `password` | text | The **bearer token / API password**. Sent as `Authorization: Bearer <password>`. |
| `testEndpoint` | text (nullable) | Override for the connection-test path. Defaults to `/WHOAMI`. |
| `created_at` / `updated_at` | timestamptz | |

RLS: enable and restrict SELECT/UPDATE to authenticated admins. The edge function reads it with the service role key.

### 2.2 `secondary_api_configs` — Additional named endpoints

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Referenced by the step config's `secondaryApiId`. |
| `name` | text NOT NULL | Human-readable name (e.g. "Warehouse System"). |
| `base_url` | text NOT NULL | Same role as `api_settings.path`. Must start with `http://` / `https://`. Trailing `/` is stripped at call time. |
| `auth_token` | text | Bearer token, optional. |
| `description` | text | Notes. |
| `is_active` | bool DEFAULT true | Whether the row is selectable in workflow config UIs. |
| `test_endpoint` | text | Override for the test path. |
| `created_at` / `updated_at` | timestamptz | |

Client CRUD lives in `src/services/configService.ts` via `fetchSecondaryApiConfigs`, `createSecondaryApiConfig`, `updateSecondaryApiConfig`, `deleteSecondaryApiConfig`.

### 2.3 UI location and shape

- **Settings → API → Configuration** tab (`ApiSettings.tsx`):
  - Card "API Endpoint" (green globe icon) with three fields: **Base API Path**, **API Password/Token** (rendered as `<input type="password">`), **Test Endpoint Override** (placeholder `/WHOAMI`).
  - Card "Secondary API Endpoints" (orange link icon) hosting `SecondaryApiSettings` — a list plus an "Add Secondary API" button that opens `SecondaryApiForm` (modal). Form fields: **API Name*, Base URL*, Authentication Token, Test Endpoint Override, Description, Enable this API configuration** (checkbox). Base URL is validated with `/^https?:\/\/.+/`.
- **Settings → API → Authentication** tab (`ApiAuthSettings.tsx`): configures higher-level auth profiles used elsewhere (e.g. OAuth2 client credentials). The workflow v2 API Endpoint step ignores these and only uses the token stored directly on the endpoint row above.
- **Settings → API → API Specifications** tab (`ApiSpecsSettings.tsx`): upload OpenAPI/Swagger docs. Parsed into `api_specs`, `api_spec_endpoints`, and `api_endpoint_fields` for path/query/body field pickers used when configuring an API Endpoint step. These tables carry the *schema* — they do NOT carry credentials.

### 2.4 What the step actually reads

The runtime does **not** read the specs tables at execution. It only needs, per invocation, `api_settings.path` + `api_settings.password` (main) OR `secondary_api_configs.base_url` + `secondary_api_configs.auth_token` (secondary). The spec tables are used purely by the UI when authoring the step.

---

## 3. How the Test button validates the Base URL

Two independent Test flows exist. Both are proven working and rely on the same trailing-slash and leading-slash normalizations.

### 3.1 Primary API — "Test TruckMate API" (uses the `api-proxy` edge function)

Trigger: `ApiSettings.tsx#handleTestTruckMateApi` sends a POST to the `api-proxy` edge function.

Client call:

```
POST {SUPABASE_URL}/functions/v1/api-proxy
Headers: Authorization: Bearer <supabase user session token>, apikey, Content-Type: application/json
Body:   { apiPath: <testEndpoint or '/WHOAMI'>, httpMethod: 'GET' }
```

Inside `supabase/functions/api-proxy/index.ts`:

1. Reject if no `Authorization: Bearer …` on the incoming request.
2. Verify the caller with `supabase.auth.getUser()` (unless the request is for a QR-code-enabled execute button, which isn't relevant here).
3. Load `api_settings.path` + `api_settings.password` (or the secondary row if `secondaryApiId` was supplied).
4. **Normalize the Base URL**: `baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl`.
5. **Normalize the path**: `normalizedPath = apiPath.startsWith('/') ? apiPath : '/' + apiPath`.
6. Build `targetUrl = `${baseUrl}${normalizedPath}${queryString ? '?' + queryString : ''}``.
7. Attach `Authorization: Bearer <authToken>` when a token exists.
8. `fetch(targetUrl, { method, headers, body? })`.
9. On failure: return `{ error, statusCode, statusText, details, url }` with the upstream status. On success: forward the JSON body (or raw text) with status 200.

Back in the UI, the response is rendered as either a green "API Test Passed" panel (with the returned JSON pretty-printed) or a red "API Test Failed" panel (with the status line and any upstream body).

**Why this works to prove the Base URL is valid:**

- The proxy strips trailing `/` from `path` and forces a leading `/` on the test path, so the Base URL you typed is the only variable in the URL — you cannot get a bad concatenation from a stray slash.
- If DNS or TLS to the Base URL fails, `fetch` throws and the proxy returns a 500 with the low-level message.
- If the Base URL resolves but `/WHOAMI` returns 4xx, the proxy relays the actual status — a 404 usually means the Base URL points at the wrong version prefix; a 401 means the token is wrong; 5xx means the upstream is broken.
- Because the call happens in the edge function (server-side), CORS does not apply — no browser preflight can mask a real reachability problem.

### 3.2 Secondary API — direct browser test

`SecondaryApiForm.tsx#handleTestConnection` skips the edge function and calls the browser `fetch` directly:

```
testPath = formData.testEndpoint?.trim() || '/WHOAMI';
normalizedPath = testPath.startsWith('/') ? testPath : '/' + testPath;
baseUrl = formData.baseUrl.endsWith('/') ? formData.baseUrl.slice(0, -1) : formData.baseUrl;
testUrl = baseUrl + normalizedPath;

fetch(testUrl, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  },
});
```

Error mapping (`getFriendlyErrorMessage`):

- `404` → "API endpoint not found. Please verify the base URL is correct."
- `401 / 403` → "Authentication failed. Please check your API token."
- `>= 500` → "API server error. Please contact your API provider or try again later."
- `>= 400` → "Invalid request. Please verify your configuration."
- Message contains `cors` / `network` / `failed to fetch` → "Unable to connect. Check that the URL is accessible and CORS is configured."
- Message contains `timeout` → "Connection timed out."

This flow is useful for quick edits inside the modal, but note it is subject to browser CORS. If the primary/secondary target rejects CORS from the app origin, prefer the proxy path (3.1) for a definitive answer.

### 3.3 Rules that make Base URL testing reliable (checklist)

Recreate these in the other app to match behavior exactly:

1. Persist the Base URL exactly as typed (do not silently strip trailing `/`); normalize only at call time.
2. Force a leading `/` on the test path at call time.
3. Default test path to `/WHOAMI`, overridable per-row.
4. For the primary API test, tunnel through a server-side proxy so CORS and untrusted TLS chains cannot produce misleading pass/fail results.
5. Return the upstream status code and body verbatim so the operator can diagnose 401 vs 404 vs 5xx.
6. Show the fully composed URL back to the operator in the failure card (`targetUrl` in the response body) so trailing-slash / prefix mistakes are visible.

---

## 4. Rebuild checklist (other application)

1. Create tables `api_settings` (single row) and `secondary_api_configs` in Supabase; enable RLS with admin-only write policies.
2. Build the Settings UI cards as in §2.3, using `<input type="password">` for the token fields.
3. Deploy an edge function `api-proxy` that mirrors §3.1 (auth check, load-by-id, base-URL + path normalization, header injection, upstream fetch, verbatim status forwarding). Include the required CORS headers on every response and the OPTIONS preflight.
4. In the Workflow v2 API Endpoint step runtime, follow the six-step pipeline in §1: resolve source → resolve URL parts → build body from `requestBodyFieldMappings` → attach `Authorization: Bearer <token>` and `Content-Type: application/json` → `fetch` → parse response (including binary sniff via `Content-Type`).
5. Wire the "Test" buttons: primary → POST to `api-proxy` with `{ apiPath: testEndpoint || '/WHOAMI', httpMethod: 'GET' }`; secondary → direct browser fetch with the friendly-error mapping in §3.2.

That is the entire contract.
