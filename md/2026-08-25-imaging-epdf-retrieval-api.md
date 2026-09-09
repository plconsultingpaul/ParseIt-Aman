# Retrieving an Imaging EPDF From Parse-It Imaging

**Date:** 2026-08-25
**Purpose:** Explain, for a separate application, how to call Parse-It Imaging to fetch an EPDF (or original PDF) by **Bill Number** or **Detail Line ID** plus **Document Type**, so the returned file can be attached to an outbound customer email.

---

## TL;DR

Parse-It already exposes a single Supabase Edge Function that both stores AND retrieves imaging documents:

```
POST  {SUPABASE_URL}/functions/v1/imaging-proxy
```

To fetch, send `action: "list"` (recommended) or `action: "get"` with a JSON body describing what you want. The response gives you a public `documentUrl` you can download and attach to the email.

- **Best match by Bill Number + Document Type:** use `action: "list"` with `billNumber` and `documentTypeId`.
- **Best match by Detail Line ID + Document Type:** use `action: "list"` (or `action: "get"`) with `detailLineId`, `documentTypeId`, and `bucketId`.

There is no separate REST endpoint — this edge function IS the API.

---

## 1. The endpoint

- URL: `POST https://<your-project-ref>.supabase.co/functions/v1/imaging-proxy`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <SUPABASE_ANON_KEY_OR_USER_JWT>`
  - `apikey: <SUPABASE_ANON_KEY>`
- Body: JSON as documented below. Always include `action`.
- CORS: allows any origin, `Content-Type, Authorization, X-Client-Info, Apikey` headers, and `GET/POST/PUT/DELETE/OPTIONS` methods, so it can be called from a browser app or a server.

The edge function uses the service role key internally to read `imaging_documents`, `imaging_buckets`, `imaging_document_types`, `imaging_metadata_fields`, and `imaging_document_metadata` — the caller does NOT need the service role key.

---

## 2. Retrieval by Bill Number + Document Type

Use `action: "list"`. Bill Number is stored two places — as a real column `imaging_documents.bill_number`, and as a metadata value in `imaging_document_metadata` keyed by the metadata field named `billNumber`. The list action tries the metadata table first, then falls back to the column.

### Request

```json
POST /functions/v1/imaging-proxy
{
  "action": "list",
  "billNumber": "12345678",
  "documentTypeId": "<uuid of the imaging_document_types row, e.g. 'POD' or 'BOL'>",
  "bucketId": "<optional: uuid of imaging_buckets row to scope the search>"
}
```

Notes:
- `documentTypeId` is the primary key of the row in `imaging_document_types` (e.g. one row per doc type such as "POD", "BOL", "Invoice"). If the caller only has the friendly name, they must first look it up via `GET /rest/v1/imaging_document_types?name=eq.POD&select=id`.
- Omit `bucketId` if you want to search across all buckets; include it to disambiguate when the same Bill Number exists in multiple buckets.
- Do not pass both `billNumber` and `detailLineId` in the same call — the list action prioritizes `detailLineId` and will ignore the bill number.

### Response (2xx)

```json
{
  "success": true,
  "action": "list",
  "detailLineId": null,
  "documents": [
    {
      "documentId": "9f3c...",
      "storagePath": "https://<project>.supabase.co/storage/v1/object/public/<bucket-slug>/POD/xyz_1699999999999.pdf",
      "documentUrl":  "https://<project>.supabase.co/storage/v1/object/public/<bucket-slug>/POD/xyz_1699999999999.pdf",
      "bucketName": "Main Imaging",
      "documentTypeName": "POD",
      "detailLineId": "L-000123",
      "billNumber": "12345678",
      "originalFilename": "pod-scan.pdf",
      "fileSize": 84213,
      "createdAt": "2026-08-24T18:22:14.201Z"
    }
  ]
}
```

- `documentUrl` is the ready-to-download **EPDF** URL when CloudConvert has finished processing (the CloudConvert webhook rewrites `imaging_documents.storage_path` to the EPDF's public URL and stores the raw key in `epdf_storage_path`). If processing has not run, `documentUrl` still points to the original PDF and remains a valid attachment.
- Documents are returned newest first, capped at 50.
- Multiple hits are possible for the same bill number (e.g. re-uploads that keep old versions). Take `documents[0]` for the newest.

### Response (not found)

```json
{ "success": false, "action": "list", "documents": [], "detailLineId": null }
```
HTTP status is 404.

---

## 3. Retrieval by Detail Line ID + Document Type

Two variants are available. Both work; choose based on what you have.

### 3a. `action: "list"` (recommended)

```json
{
  "action": "list",
  "detailLineId": "L-000123",
  "documentTypeId": "<doc type uuid>",
  "bucketId": "<optional bucket uuid>"
}
```

Same response shape as §2. This is the safer default because it also checks `imaging_document_metadata` (where `detailLineId` is stored for documents indexed after the metadata refactor).

### 3b. `action: "get"` (single exact match)

```json
{
  "action": "get",
  "bucketId": "<bucket uuid>",         // required
  "documentTypeId": "<doc type uuid>", // required
  "detailLineId": "L-000123"           // required
}
```

Response:

```json
{
  "success": true,
  "action": "get",
  "documentId": "9f3c...",
  "storagePath": "https://.../xyz.pdf",
  "documentUrl":  "https://.../xyz.pdf",
  "bucketName": "Main Imaging",
  "detailLineId": "L-000123",
  "billNumber": "12345678",
  "originalFilename": "pod-scan.pdf"
}
```

Only reads the `detail_line_id` column on `imaging_documents` (does NOT consult the metadata table). Prefer §3a unless you know the row was written with the column populated.

---

## 4. Retrieval by known Document ID

If the other app already has the `imaging_documents.id`, use the fastest path:

```json
{ "action": "get", "documentId": "9f3c..." }
```

or

```json
{ "action": "list", "documentId": "9f3c..." }
```

Both return the same `documentUrl` field described above.

---

## 5. Downloading the file and attaching it to the email

From the response take `documentUrl`. It is a fully qualified HTTPS URL served by Supabase Storage's public bucket endpoint (or, for external buckets, the bucket's `url` prefix). To attach:

1. `GET documentUrl` — no auth headers needed for public buckets.
2. Read the response as bytes.
3. Attach as `application/pdf` with `originalFilename` (or your own name like `POD-<billNumber>.pdf`).

If the target bucket is private (rare in this codebase), the same URL will require the Supabase service key. Prefer configuring a public bucket for outbound email attachments.

---

## 6. How the caller identifies `documentTypeId` and `bucketId`

The other app must know these UUIDs (or look them up once and cache them):

```
GET  {SUPABASE_URL}/rest/v1/imaging_document_types?select=id,name&order=name.asc
GET  {SUPABASE_URL}/rest/v1/imaging_buckets?select=id,name,url,supabase_storage_slug&order=name.asc
Headers: Authorization: Bearer <SUPABASE_ANON_KEY>, apikey: <SUPABASE_ANON_KEY>
```

A user-friendly implementation is: on first launch, load both lists into dropdowns; the operator picks "Document Type" and "Bucket" once per environment; the app then keeps sending those UUIDs to `imaging-proxy` for every retrieval.

---

## 7. End-to-end example (fetch + email attachment)

Pseudocode from the calling app:

```ts
const resp = await fetch(`${SUPABASE_URL}/functions/v1/imaging-proxy`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({
    action: 'list',
    billNumber: order.billNumber,
    documentTypeId: DOC_TYPE_POD,
    bucketId: DEFAULT_BUCKET_ID,
  }),
});
const json = await resp.json();
if (!json.success || !json.documents?.length) throw new Error('EPDF not found');

const doc = json.documents[0];
const pdfBytes = new Uint8Array(await (await fetch(doc.documentUrl)).arrayBuffer());

await sendEmail({
  to: customerEmail,
  subject: `POD for Bill ${order.billNumber}`,
  attachments: [{
    filename: `POD-${order.billNumber}.pdf`,
    content: pdfBytes,
    contentType: 'application/pdf',
  }],
});
```

---

## 8. Error handling checklist

| Situation | Response |
|-----------|----------|
| Missing filters | 400 `{ error: "At least one filter is required: ..." }` |
| Unknown `action` | 400 `{ error: "Unknown action: ..." }` |
| Bucket UUID not in DB | 404 `{ error: "Bucket not found: ..." }` (get) |
| No documents match | 404 `{ success: false, documents: [] }` |
| Storage/DB internal failure | 500 `{ error, details }` |

Callers should treat any non-2xx as "no EPDF available" and either skip the attachment or surface a "document not on file" message to the operator.

---

## 9. What already exists vs. what may be missing

Already in place, no work required:
- `imaging-proxy` edge function with `put` / `get` / `list` actions.
- Storage of Bill Number and Detail Line ID on `imaging_documents` AND as searchable metadata rows.
- CloudConvert-produced EPDF public URL exposed via `storage_path`.

Potentially worth adding in a follow-up (not required to unblock the other app):
- A convenience action `getByBill` that takes only `billNumber` and returns the newest match across any document type — currently the caller must pass `documentTypeId`.
- A signed-URL variant for private buckets so the calling app never sees the raw storage key.
- A GET-verb alias (query-string based) for callers that cannot easily send a JSON POST.

That is the whole retrieval path. The other application does not need any new endpoint — it can call `imaging-proxy` today.
