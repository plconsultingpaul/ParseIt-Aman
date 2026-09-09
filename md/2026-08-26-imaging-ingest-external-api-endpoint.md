# Imaging Ingest — External API Endpoint

Date: 2026-08-26

## Purpose

Allow external software to post a PDF into Imaging with a known Document Type and Bill Number, and have it flow through the standard CloudConvert ePDF pipeline just like an internal upload.

## What was built

### Edge Function

**`POST /functions/v1/imaging-ingest`** (deployed with `verify_jwt: false`)

Bearer-token authenticated against the Supabase secret `IMAGING_INGEST_API_KEY` using a timing-safe comparison. Requests without a valid token receive a generic `401 Unauthorized` and are logged.

**Request headers**

```
Authorization: Bearer <IMAGING_INGEST_API_KEY>
Content-Type: application/json
```

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `bucketId` | uuid | one of `bucketId` / `bucketSlug` | Preferred (unambiguous). |
| `bucketSlug` | string | one of `bucketId` / `bucketSlug` | The bucket's `supabase_storage_slug`. |
| `documentTypeId` | uuid | one of `documentTypeId` / `documentTypeName` | Preferred. |
| `documentTypeName` | string | one of `documentTypeId` / `documentTypeName` | Case-insensitive lookup. |
| `billNumber` | string | yes | Stored on `imaging_documents.bill_number`. |
| `detailLineId` | string | no | Stored on `imaging_documents.detail_line_id`. |
| `originalFilename` | string | yes | Original PDF filename. |
| `fileBase64` | string | one of `fileBase64` / `fileUrl` | Raw base64 PDF (data URI prefix accepted). |
| `fileUrl` | string | one of `fileBase64` / `fileUrl` | HTTPS URL the function will fetch. |
| `metadata` | object<string,string> | no | `{ field_name: value }`; matched to `imaging_metadata_fields.field_name`. Unknown fields are ignored. |

**Success response (200)**

```json
{
  "success": true,
  "imagingDocumentId": "<uuid>",
  "storagePath": "2026/08/<uuid>_original.pdf",
  "cloudConvertJobId": "<cloudconvert-job-id>",
  "ePdfStatus": "processing",
  "hasTextLayer": true
}
```

**Failure responses**

- `400` — invalid body / missing PDF signature / bucket/document type inactive / document type not enabled on bucket
- `401` — missing or invalid bearer token
- `404` — bucket or document type not found
- `500` — storage upload / insert failure
- `502` — CloudConvert / trigger-pdf-processing failure (the imaging document is marked `failed`)

### Flow

1. Verify bearer token (timing-safe).
2. Validate body and resolve bucket + document type.
3. Verify the document type is enabled on the bucket (`imaging_bucket_document_types`).
4. Load PDF bytes (base64 or fetched URL), verify `%PDF` header.
5. Detect whether the PDF has an existing text layer (via `unpdf`) — used to set `skip_ocr`.
6. Upload to Supabase storage under `${year}/${month}/${uuid}_${filename}` in the bucket's `supabase_storage_slug`.
7. Insert `imaging_documents` row with `processing_status = 'processing'`.
8. Insert `imaging_document_metadata` rows for any recognized `metadata` fields.
9. Call `trigger-pdf-processing` with `{ file_url, imaging_document_id, skip_ocr }` to kick off the CloudConvert `import → (ocr) → optimize → export` pipeline. `cloudconvert-webhook` will write back the ePDF to the same `imaging_documents` row.
10. Insert a `success` row in `imaging_ingest_logs`.

If the CloudConvert trigger fails, the uploaded document is marked `failed`, the storage object is left in place (matches internal-upload behavior), and a `502` is returned with the imaging document id so the caller can retry indexing.

## Database changes

New migration: `20260826160445_add_imaging_ingest_api_keys_and_logs.sql`

- **`imaging_ingest_logs`** — audit table populated by every ingest request (success, error, or unauthorized). Columns: `id, api_key_id, partner_name, original_filename, bill_number, document_type_name, bucket_id, imaging_document_id, status, error_message, created_at`. RLS enabled; authenticated users can read.
- **`imaging_api_keys`** — reserved for a future per-partner key model. Not used by the current single-secret implementation. Left in place so the schema is ready if we upgrade to option B later. RLS enabled; authenticated users can manage.

## Configuration

The endpoint expects a Supabase edge function secret named:

- `IMAGING_INGEST_API_KEY`

This secret is not set yet. Add it in the Supabase dashboard (Project → Settings → Edge Functions → Secrets) before sharing the URL with any external partner. Generate a strong random value (32+ bytes, base64 or hex).

## Security notes

- Token is compared in constant time against the environment secret; no partial-match leaks.
- `401` responses are generic — they never echo the token or say whether the header was missing versus wrong.
- The function uses the service-role key internally; it never trusts client-supplied identifiers beyond validating them against database rows.
- Uploaded files are stored under a random UUID prefix; the ingest endpoint refuses non-PDF content by checking the `%PDF` header.
- Every request (including unauthorized ones) is written to `imaging_ingest_logs` for audit.

## Follow-up options (not built)

- **Per-partner keys** — enable the `imaging_api_keys` table and add a management screen under Imaging Settings.
- **Idempotency** — accept an `Idempotency-Key` header and dedupe by `(key_hash, idempotency_key)` in `imaging_ingest_logs`.
- **`source_type = 'api'` column** on `imaging_documents` to distinguish API-ingested docs in reports.
