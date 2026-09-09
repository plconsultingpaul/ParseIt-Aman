# 2026-08-06 — QR Code Format for Parse-It and TradeWeave

The mobile app connects to a backend by scanning a QR code. This document tells the
**Parse-It** and **TradeWeave** teams exactly what to put inside that QR code so the mobile
app recognises the product and connects to the right backend.

## What the QR code contains

The QR code must encode a single **JSON string** (plain text). The app reads it with a JSON
parser, so the content must be valid JSON.

### Fields

| Field             | Required | Description                                                                 |
|-------------------|----------|-----------------------------------------------------------------------------|
| `supabaseUrl`     | Yes      | The product backend's URL, e.g. `https://xxxx.supabase.co` (no trailing `/`).|
| `supabaseAnonKey` | Yes      | The backend's public anon key (the `eyJ…` value). Safe to share; access is enforced by row-level security. |
| `instanceName`    | Yes      | The name shown to the user for this connection, e.g. `Acme Corp TradeWeave`. |
| `application`     | Yes      | The product tag. Use exactly one of the values below.                       |

### The `application` value — use exactly one of these

- TradeWeave → `"tradeweave"`
- Parse-It → `"parse-it"`

(The `application` value is lowercase, hyphenated, and must match exactly.)

## Examples

TradeWeave:

```json
{
  "supabaseUrl": "https://abcd1234.supabase.co",
  "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "instanceName": "Acme Corp TradeWeave",
  "application": "tradeweave"
}
```

Parse-It:

```json
{
  "supabaseUrl": "https://wxyz5678.supabase.co",
  "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "instanceName": "Acme Corp Parse-It",
  "application": "parse-it"
}
```

## How to generate the QR code

1. Build the JSON object above with your backend's real URL and anon key.
2. Convert it to a compact JSON string (a normal `JSON.stringify` is fine).
3. Encode that exact string as a standard QR code (any QR library or generator that encodes
   plain text works).
4. Show it on your product's settings page so a user can scan it with the mobile app.

## Rules and notes

- Use the **anon/public** key, never a service-role or secret key.
- Do not add a trailing slash to `supabaseUrl`.
- Keep the field names exactly as written (they are case-sensitive).
- The `application` tag is what tells the app which experience to open: TradeWeave opens the
  grid/actions/logs experience; Parse-It opens the step-by-step workflow experience.

## Timing

The app reads the `application` tag once **Phase 1** of the multi-application work has
shipped (see `2026-08-06-multi-application-phases.md`). You can start producing QR codes in
this format now — including `application` early is safe, and it becomes required as soon as
the app supports more than one product.
