# 2026-08-06 — Applications: Parse-It Mobile Connection QR Code

## Summary
Added a way to connect the Parse-It mobile app to this workspace from the
**Settings → Applications** screen. A new "Mobile App Connection" button opens a
modal that displays a scannable QR code containing this backend's connection
details.

## QR Code Contents
The QR encodes a compact JSON string per the agreed format
(`public/2026-08-06-qr-code-format-parseit-tradeweave.md`):

```json
{
  "supabaseUrl": "<backend url, trailing slash stripped>",
  "supabaseAnonKey": "<public anon key>",
  "instanceName": "Parse-It",
  "application": "parse-it"
}
```

- `supabaseUrl` / `supabaseAnonKey` come from the existing frontend environment
  values (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
- `instanceName` is fixed to `"Parse-It"`.
- `application` is hard-coded to `"parse-it"` (this backend only serves Parse-It).
- The anon key lives inside the QR only; it is never shown as plain text.

## Changes

### New — `src/components/settings/MobileConnectionModal.tsx`
- Self-contained modal (rendered via portal) that builds the JSON payload and
  renders it as a QR image using the already-installed `qrcode` package
  (`QRCode.toDataURL`).
- Includes a "Download QR Code" button that saves the code as a PNG.
- Shows a spinner while generating and a clear error state if the backend
  connection values are missing.

### Updated — `src/components/settings/ApplicationsSettings.tsx`
- Added a "Mobile App Connection" button (phone icon) next to "Add Application"
  in the screen header.
- Wired the button to open the new modal.

## Notes
- No database changes were required — the connection values already exist in the
  app and are reused directly.
- No new dropdowns or date pickers were introduced; existing edit actions on this
  screen already use pencil icons.
