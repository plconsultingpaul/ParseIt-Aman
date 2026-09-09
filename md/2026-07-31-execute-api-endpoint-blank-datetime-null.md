# 2026-07-31 — Execute Flow: Blank DateTime Sent as null in API Endpoint Step

## Problem
In the Execute Flow Designer's **API Endpoint** step, when a DateTime field was
left blank/empty, it was sent to the API as an empty string `""` instead of
`null`. APIs that accept `null` (but reject `""`) for optional datetime fields
were failing when the user didn't enter a value.

Example of the bad request body (note `"ITIME_READY": ""`):

```json
{
  "IDEPART_DATE": "2026-07-31T00:00:00",
  "ITIME_READY": "",
  "ITEMP": null
}
```

## Root Cause
In `supabase/functions/execute-button-processor/actions/apiEndpoint.ts`, the
field-value guard only skips `undefined`/`null`, so an empty string passed
through. In the `datetime` formatting branch a blank value matched none of the
date patterns and fell through unchanged, producing `""`.

(Integer fields appeared to work only by accident: `parseInt("")` is `NaN`,
which `JSON.stringify` serializes to `null`.)

## Fix (targeted — DateTime only)
In the `datetime` branch, the value is now trimmed first; if it is empty, the
final value is set to `null` so it is written to the request body as `null`.
All other data types are unchanged.

```
else if (mapping.dataType === 'datetime') {
  const dateValue = String(finalValue).trim();
  if (dateValue === '') {
    finalValue = null;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateValue)) {
    ...
```

## Scope
- Applies to `executeApiEndpointSingle`, which also runs each row of **loop**
  array mode, so both single-object and loop requests are covered.
- Only the DateTime data type was changed; empty text fields are left as-is.
- The `execute-button-processor` edge function was redeployed.
