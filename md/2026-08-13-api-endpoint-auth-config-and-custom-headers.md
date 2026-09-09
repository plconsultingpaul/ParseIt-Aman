# 2026-08-13 — Workflow V2: API Endpoint Auth Config Support & Custom Headers

## Summary

Two targeted enhancements to the API Endpoint workflow step, enabling full WorkOptima-style integrations where authentication credentials come from the Auth Config and custom headers (e.g. vendor-specific tokens) must be sent with each request.

---

## Changes

### 1. Auth Config Source Support in API Endpoint Step

**Problem:** The API Endpoint step's "API Source" dropdown included an "Auth Config" option in the UI, but the backend ignored it — only "Main API" and "Secondary API" were handled. Selecting "Auth Config" resulted in an empty base URL and no authentication token, causing the request to fail silently.

**Fix:** The backend now handles the `auth_config` source type identically to how the Multipart Form Upload step already does:
- Fetches the selected auth config from the database
- Calls the configured login endpoint with the stored username and password
- Extracts the token using the configured token field name (supports nested paths via `getValueByPath`, e.g. `token.access_token`)
- Uses the auth config's base URL and the obtained token for the API request

**Files changed:**
- `supabase/functions/json-workflow-processor-v2/steps/apiEndpoint.ts` — Added `auth_config` branch
- `supabase/functions/json-workflow-processor-v2/steps/api.ts` — Added `auth_config` branch in `executeApiEndpoint`
- `supabase/functions/transform-workflow-processor-v2/steps/apiEndpoint.ts` — Added `auth_config` branch

### 2. Custom Headers with Variable Resolution in API Endpoint Step

**Problem:** The API Endpoint step only sent hardcoded `Content-Type` and `Authorization: Bearer` headers. There was no way to add custom headers (e.g. vendor-specific tokens like `Access-Token`), unlike the API Call and Multipart Upload steps which both supported this.

**Fix:**
- Added a "Custom Headers" collapsible section to the API Endpoint configuration panel with key/value inputs and add/remove controls, matching the existing pattern in the Multipart Upload step config.
- The backend processes `config.customHeaders` and resolves `{{variable}}` placeholders in header values at runtime (e.g. `Access-Token: {{response.access_token}}`).
- `Content-Type` is protected from being overridden by custom headers.

**Files changed:**
- `src/components/settings/workflow-v2/V2ApiEndpointConfig.tsx` — New Custom Headers UI section
- `supabase/functions/json-workflow-processor-v2/steps/apiEndpoint.ts` — Custom headers processing with variable resolution
- `supabase/functions/json-workflow-processor-v2/steps/api.ts` — Same change in `executeApiEndpoint`
- `supabase/functions/transform-workflow-processor-v2/steps/apiEndpoint.ts` — Same change

---

## Backward Compatibility

- All changes are additive. Existing workflows with no `customHeaders` or no `auth_config` source type continue to work identically.
- The `getValueByPath` fallback (`?? loginData[tokenFieldName]`) ensures top-level token field names still resolve correctly.
- API Endpoint steps with no custom headers pass through unchanged — the default `Content-Type` and `Authorization` headers remain.

---

## Example: WorkOptima Workflow (Complete)

1. **API Call step** → POST to WorkOptima login endpoint → map `token.access_token` from response to a variable
2. **Multipart Form Upload step** → Send PDF with custom header `Access-Token: {{response.access_token}}`
3. **API Endpoint step** (now works) → POST file information to WorkOptima with custom header `Access-Token: {{response.access_token}}`, using a Secondary API source (with GUID-specific URL) or Auth Config source
