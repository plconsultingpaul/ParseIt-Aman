# Imaging Ingest API — Partner Integration Guide

**Date:** 2026-08-26
**Endpoint status:** Live in production
**Audience:** External software / partner integrations that need to POST PDFs into Imaging with a known Document Type and Bill Number.

---

## 1. What this endpoint does

`POST` a PDF (plus a small JSON envelope) and the platform will:

1. Validate your bearer token.
2. Validate the target Bucket and Document Type (must both be active and the Document Type must be enabled on that Bucket).
3. Store the PDF in the Bucket's Supabase storage location under a path like `YYYY/MM/<uuid>_<sanitized-filename>.pdf`.
4. Create an `imaging_documents` row in status `processing`, tagged with your `billNumber` (and optional `detailLineId`).
5. Insert any metadata field values you supplied.
6. Kick off the standard CloudConvert ePDF pipeline (`import → optional OCR → optimize → export`). The resulting searchable ePDF is written back to the same imaging document automatically via the `cloudconvert-webhook`.
7. Return a JSON response with the new `imagingDocumentId` and CloudConvert job id.

The PDF you send is treated identically to a PDF uploaded through the UI or ingested via email/SFTP.

---

## 2. Endpoint

```
POST https://ayicmibyivuqhpeagzel.supabase.co/functions/v1/imaging-ingest
```

- Content type: `application/json`
- Auth: `Authorization: Bearer <IMAGING_INGEST_API_KEY>` (shared secret — see section 3)
- CORS: `*` (accepts calls from any origin)
- Timeout budget: keep total payload + processing under 60 seconds. For very large PDFs prefer `fileUrl` over `fileBase64`.

---

## 3. Authentication

Every request must include an `Authorization` header:

```
Authorization: Bearer <IMAGING_INGEST_API_KEY>
```

- The key is a single shared secret managed on the server side.
- The server compares it in constant time. Any missing/invalid/mismatched key returns `401 Unauthorized` with a generic body — the response never echoes the presented token.
- Keep the token out of URLs, out of client-side code, and out of logs. Rotate by having the platform team update the server-side secret and reissuing you a new one.

---

## 4. Request body

```json
{
  "bucketId":         "uuid — optional if bucketSlug is provided",
  "bucketSlug":       "string — optional if bucketId is provided (matches imaging_buckets.supabase_storage_slug)",

  "documentTypeId":   "uuid — optional if documentTypeName is provided",
  "documentTypeName": "string — optional if documentTypeId is provided (case-insensitive match)",

  "billNumber":       "string — REQUIRED",
  "detailLineId":     "string — optional",

  "originalFilename": "string — REQUIRED, e.g. 'BOL-12345.pdf'",

  "fileBase64":       "string — base64-encoded PDF bytes (data-URI prefix allowed), OR",
  "fileUrl":          "string — a URL the server can GET to retrieve the PDF",

  "metadata": {
    "<metadata_field_name>": "<value>",
    "...": "..."
  }
}
```

### Field rules

| Field | Type | Required | Notes |
|---|---|---|---|
| `bucketId` **or** `bucketSlug` | string | Yes (one of) | Prefer `bucketId` if you have it. `bucketSlug` matches the bucket's `supabase_storage_slug`. Bucket must be `is_active = true`. |
| `documentTypeId` **or** `documentTypeName` | string | Yes (one of) | Case-insensitive name match. Document type must be `is_active = true` AND linked to the target bucket via `imaging_bucket_document_types`. |
| `billNumber` | string | Yes | Non-empty after trim. Written to `imaging_documents.bill_number`. |
| `detailLineId` | string | No | Optional link to a shipment detail line. Written to `imaging_documents.detail_line_id`. |
| `originalFilename` | string | Yes | The filename shown in the UI. Sanitized before storage: only `A-Z a-z 0-9 . _ -` are kept, max 200 chars. |
| `fileBase64` **or** `fileUrl` | string | Yes (one of) | The PDF bytes. The first 5 bytes must decode to `%PDF` or the request is rejected. |
| `metadata` | object | No | Free-form `{ fieldName: value }`. Only fields that already exist in `imaging_metadata_fields` are stored — unknown names are silently ignored. Values are cast to strings. |

### File payload — which to use

- **`fileBase64`** — simplest. Include a raw base64 string, or a `data:application/pdf;base64,...` data URI (the prefix is stripped). Keep total request under a few MB.
- **`fileUrl`** — a URL the server can `GET`. Use this for large PDFs, or when the file is already sitting on a CDN/S3/etc. The URL must return HTTP 200 with the raw PDF bytes; redirects are followed by the runtime.

---

## 5. Example request

### curl (base64)

```bash
FILE_B64=$(base64 -w0 sample.pdf)

curl -X POST \
  https://ayicmibyivuqhpeagzel.supabase.co/functions/v1/imaging-ingest \
  -H "Authorization: Bearer $IMAGING_INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"bucketSlug\": \"main-imaging\",
    \"documentTypeName\": \"Bill of Lading\",
    \"billNumber\": \"BOL-12345\",
    \"originalFilename\": \"BOL-12345.pdf\",
    \"fileBase64\": \"$FILE_B64\",
    \"metadata\": {
      \"customer_ref\": \"CUST-987\",
      \"shipment_date\": \"2026-08-26\"
    }
  }"
```

### curl (URL)

```bash
curl -X POST \
  https://ayicmibyivuqhpeagzel.supabase.co/functions/v1/imaging-ingest \
  -H "Authorization: Bearer $IMAGING_INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "bucketId":         "b1e6...-...-...-...-...",
    "documentTypeId":   "d7a3...-...-...-...-...",
    "billNumber":       "BOL-12345",
    "originalFilename": "BOL-12345.pdf",
    "fileUrl":          "https://example.com/tmp/BOL-12345.pdf"
  }'
```

### JavaScript / Node (fetch, base64)

```js
import { readFile } from "node:fs/promises";

const pdf = await readFile("./BOL-12345.pdf");
const res = await fetch(
  "https://ayicmibyivuqhpeagzel.supabase.co/functions/v1/imaging-ingest",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.IMAGING_INGEST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketSlug: "main-imaging",
      documentTypeName: "Bill of Lading",
      billNumber: "BOL-12345",
      originalFilename: "BOL-12345.pdf",
      fileBase64: pdf.toString("base64"),
      metadata: { customer_ref: "CUST-987" },
    }),
  },
);
const json = await res.json();
if (!res.ok) throw new Error(`Ingest failed: ${res.status} ${JSON.stringify(json)}`);
console.log("Imaging document:", json.imagingDocumentId);
```

### C# (HttpClient, URL)

```csharp
using var http = new HttpClient();
http.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("IMAGING_INGEST_API_KEY"));

var payload = new {
    bucketSlug = "main-imaging",
    documentTypeName = "Bill of Lading",
    billNumber = "BOL-12345",
    originalFilename = "BOL-12345.pdf",
    fileUrl = "https://example.com/tmp/BOL-12345.pdf"
};

var res = await http.PostAsync(
    "https://ayicmibyivuqhpeagzel.supabase.co/functions/v1/imaging-ingest",
    new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"));

res.EnsureSuccessStatusCode();
var body = await res.Content.ReadAsStringAsync();
```

### Python (requests, base64)

```python
import base64, os, requests

with open("BOL-12345.pdf", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

r = requests.post(
    "https://ayicmibyivuqhpeagzel.supabase.co/functions/v1/imaging-ingest",
    headers={
        "Authorization": f"Bearer {os.environ['IMAGING_INGEST_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "bucketSlug": "main-imaging",
        "documentTypeName": "Bill of Lading",
        "billNumber": "BOL-12345",
        "originalFilename": "BOL-12345.pdf",
        "fileBase64": b64,
        "metadata": {"customer_ref": "CUST-987"},
    },
    timeout=60,
)
r.raise_for_status()
print(r.json())
```

---

## 6. Success response — `200 OK`

```json
{
  "success": true,
  "imagingDocumentId": "8f5c...-...-...-...-...",
  "storagePath": "2026/08/9a3c...-BOL-12345.pdf",
  "cloudConvertJobId": "abc123-def456-...",
  "ePdfStatus": "processing",
  "hasTextLayer": true
}
```

- `imagingDocumentId` — persist this. It is the record id in `imaging_documents`. You can use it later to check status or reference the document.
- `storagePath` — the object key inside the bucket's Supabase storage bucket.
- `cloudConvertJobId` — the CloudConvert job that is producing the ePDF. May be `null` if not returned by the trigger.
- `ePdfStatus` — always `"processing"` at return time. When the CloudConvert webhook completes, `imaging_documents.processing_status` moves to `completed` and `imaging_documents.epdf_storage_path` is populated.
- `hasTextLayer` — `true` when the PDF already contains a text layer (OCR is skipped for speed), `false` when the pipeline will run OCR.

---

## 7. Error responses

All errors are JSON:

```json
{ "error": "<short human-readable reason>", "details": "<optional>" }
```

| HTTP | Meaning | Retry? |
|---|---|---|
| `400` | Missing/invalid input: no `billNumber`, no `originalFilename`, no bucket or type identifier, no file payload, file is not a PDF, bucket inactive, doc type inactive, doc type not enabled on bucket. | No — fix the request and resend. |
| `401` | Missing or invalid bearer token. | No — verify the key. |
| `404` | Bucket or Document Type could not be resolved. | No — check identifiers. |
| `405` | Wrong method (only `POST` is accepted). | No. |
| `500` | Server misconfiguration (bearer secret unset, missing storage slug), or an unexpected storage/database error. | Yes, with backoff — but alert if it persists. |
| `502` | The PDF was saved and the imaging document was created, BUT the CloudConvert ePDF pipeline failed to start. The response body includes `imagingDocumentId` so the document can be retried through the UI (Reprocess) or a follow-up call to `trigger-pdf-processing`. | Yes for the ePDF step only — do NOT resubmit the whole PDF, that would create a duplicate. |

Example 502:

```json
{
  "error": "ePDF pipeline trigger failed",
  "details": { "error": "..." },
  "imagingDocumentId": "8f5c...-..."
}
```

### Idempotency

There is currently **no idempotency key** on this endpoint. If your first call returns `200` and you retry anyway, you will create a second imaging document. On network timeouts where you did not receive a `200`, check whether the document already exists (search by `billNumber` + `originalFilename` in the UI) before retrying.

---

## 8. Sequencing / rate

- One request creates one imaging document. Send them one at a time or in small parallel batches.
- The CloudConvert step runs asynchronously — you do not need to wait between calls.
- Keep sustained throughput modest (a few requests per second). If you need higher, contact the platform team before ramping.

---

## 9. Field lookup — how to know what to send

Ask the platform team (or export from Settings → Imaging) for:

1. **Bucket** — the exact `id` and/or `supabase_storage_slug` of the bucket you should be sending to.
2. **Document Types** — the `id` (or exact name) of each type you are allowed to write, plus confirmation those types are linked to your bucket.
3. **Metadata fields** — the `field_name` of any `imaging_metadata_fields` you want to populate. Unknown names are silently dropped.

---

## 10. What happens after a successful call

1. Row appears in `imaging_documents` with `processing_status = 'processing'`, tagged with your `billNumber`.
2. Any recognised metadata is written to `imaging_document_metadata`.
3. CloudConvert runs the ePDF pipeline in the background.
4. `cloudconvert-webhook` receives the completed export, writes the ePDF path to `imaging_documents.epdf_storage_path`, sets `epdf_job_id`, and flips `processing_status` to `completed` (or `failed` on error).
5. The document is visible in the Imaging UI immediately, and searchable/openable as an ePDF once CloudConvert finishes.

---

## 11. Audit log

Every request (success, error, unauthorized) is written to `imaging_ingest_logs` on a best-effort basis with:

- status, error message (if any), bill number, filename, bucket id, document type name, imaging document id, timestamp.

The platform team can query this table to help you troubleshoot.

---

## 12. Change history

- **2026-08-26** — endpoint created (`supabase/functions/imaging-ingest`), shared-secret auth, audit log table added.
