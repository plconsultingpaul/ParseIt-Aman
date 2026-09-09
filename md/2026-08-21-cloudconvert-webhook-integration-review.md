# CloudConvert + Webhook Integration — How This Parse-It Does It

Hand this to the other Parse-It build to compare against. It documents exactly
how the working version sends a job to CloudConvert, what URL it tells
CloudConvert to call back, what the webhook does when it receives that call,
and every place the other app could be off by one setting.

## Short answer to "is it sending the wrong callback address?"

Possibly. The callback URL is built at runtime from `SUPABASE_URL`:

```
webhook_url = `${SUPABASE_URL}/functions/v1/cloudconvert-webhook`
```

Where `SUPABASE_URL` is the **Edge Function secret** in the Supabase project
that made the outbound call. If the other Parse-It has:

- `SUPABASE_URL` pointing at the wrong project (e.g. dev URL in a prod project),
- the `cloudconvert-webhook` function not deployed or renamed to something else,
- `verify_jwt = true` on the webhook function (CloudConvert will not send a JWT
  and every callback will be rejected before it even reaches the code), or
- a webhook signing secret mismatch,

CloudConvert will POST to a URL that either 404s, 401s, or hits the wrong
project. From CloudConvert's side the job still "completes" — but no Parse-It
row is ever updated. That matches the symptom of "webhook isn't working".

Full details and each check below.

---

## 1. Overall flow

```
Parse-It UI / Imaging step
        │
        ▼
Edge Function: trigger-pdf-processing
  1. Insert row into public.epdf_processing_jobs (status='pending')
  2. Build a CloudConvert job with tasks: import/url → (pdf/ocr) → optimize → export/url
  3. POST to https://api.cloudconvert.com/v2/jobs  with:
         Authorization: Bearer $CLOUDCONVERT_API_KEY
         body.webhook_url    = `${SUPABASE_URL}/functions/v1/cloudconvert-webhook`
         body.webhook_events = ["job.finished", "job.failed"]
         body.tag            = customer_id
  4. Store CloudConvert's returned job id on the epdf_processing_jobs row
     and set status='processing'

CloudConvert runs the pipeline

CloudConvert → HTTP POST → Edge Function: cloudconvert-webhook
  1. (Optional) Verify HMAC-SHA256 signature from `CloudConvert-Signature`
     header using $CLOUDCONVERT_WEBHOOK_SIGNING_SECRET
  2. Look up the epdf_processing_jobs row by cloudconvert_job_id
  3. On job.finished: download the exported file, upload it to Supabase storage,
     mark the job 'completed', update imaging_documents.processing_status
  4. On job.failed: collect per-task errors, mark the job 'failed', update
     imaging_documents.processing_status
```

Two Edge Functions are involved:

- `supabase/functions/trigger-pdf-processing/index.ts` — outbound side
- `supabase/functions/cloudconvert-webhook/index.ts` — inbound side

---

## 2. Outbound: `trigger-pdf-processing`

### 2.1 Environment secrets it requires
Set in Supabase Dashboard → Edge Functions → Secrets:

| Name                    | Purpose                                                |
|-------------------------|--------------------------------------------------------|
| `SUPABASE_URL`          | Auto-provisioned. Used to build the webhook callback.  |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provisioned. Used to insert epdf_processing_jobs. |
| `CLOUDCONVERT_API_KEY`  | Bearer token for `api.cloudconvert.com`.               |

If any of these is missing on the broken app it fails fast with an explicit
error before ever calling CloudConvert.

### 2.2 The exact CloudConvert payload (verbatim from the working code)

```json
{
  "tasks": {
    "import-pdf": { "operation": "import/url", "url": "<file_url>" },
    "ocr-pdf":    { "operation": "pdf/ocr", "input": ["import-pdf"], "language": ["eng"] },
    "optimize-pdf": {
      "operation": "optimize",
      "input": ["ocr-pdf"],
      "input_format": "pdf",
      "profile": "web"
    },
    "export-pdf": { "operation": "export/url", "input": ["optimize-pdf"] }
  },
  "tag": "<customer_id>",
  "webhook_url": "https://<PROJECT_REF>.supabase.co/functions/v1/cloudconvert-webhook",
  "webhook_events": ["job.finished", "job.failed"]
}
```

Notes:
- When `skip_ocr = true`, the `ocr-pdf` task is dropped and `optimize-pdf` reads
  directly from `import-pdf`.
- `webhook_url` is **built at runtime** from `Deno.env.get("SUPABASE_URL")`. It
  is NOT hard-coded and NOT read from any DB row.
- `webhook_events` is exactly `["job.finished", "job.failed"]`. If the other
  app has different events (e.g. only `job.created`), no completion callback
  will ever fire.

### 2.3 What gets stored on the outbound side
After the CloudConvert `POST /v2/jobs` succeeds:

```
UPDATE public.epdf_processing_jobs
   SET cloudconvert_job_id = <ccData.data.id>::text,
       status              = 'processing',
       updated_at          = now()
 WHERE id = <local job id>;
```

`cloudconvert_job_id` is the single key used to find the row again when the
webhook arrives, so it must be saved as **text** in the exact form
CloudConvert returned. Any TRIM/UUID casting on the other app will break the
lookup.

---

## 3. Inbound: `cloudconvert-webhook`

### 3.1 URL CloudConvert will call
Whatever the outbound side put in `webhook_url`. In this working project that
resolves to:

```
https://<PROJECT_REF>.supabase.co/functions/v1/cloudconvert-webhook
```

**This function must be deployed with `verify_jwt = false`.** CloudConvert does
not send a Supabase JWT. If `verify_jwt` is left at the default `true`,
Supabase's gateway rejects the request with 401 before your handler runs and
the webhook silently "does nothing".

Verify with the Supabase MCP `list_edge_functions` tool on the broken project —
check that `cloudconvert-webhook` is listed and has `verify_jwt: false`.

### 3.2 Signature verification (optional but recommended)
If `CLOUDCONVERT_WEBHOOK_SIGNING_SECRET` is set as an Edge Function secret:

- Reads the header `CloudConvert-Signature`
- Computes `HMAC-SHA256(rawBody, secret)` as lowercase hex
- Rejects with 401 if they don't match

If the other app has the secret set but with a **different value** than what
CloudConvert has configured for the webhook, every callback will 401. Either
set both sides to the same value, or unset the secret on the Edge Function
side while you debug (the code treats it as optional).

### 3.3 Row lookup

```sql
SELECT id, customer_id, imaging_document_id
FROM   public.epdf_processing_jobs
WHERE  cloudconvert_job_id = '<jobData.id>'
LIMIT  1;
```

If this returns no row, the webhook responds `404 { error: "No matching job found" }`.
Common reasons on the broken app:
- `cloudconvert_job_id` was stored with different casing or wrapped in JSON
- Row was deleted before the callback arrived
- Webhook is hitting the wrong Supabase project entirely (SUPABASE_URL wrong)

### 3.4 On `job.finished`
- Finds the task with `operation === "export/url"` and `status === "finished"`
- Downloads `result.files[0].url`
- Resolves target Storage bucket:
  - Default `documents-ready`
  - Or, if the job is tied to an `imaging_documents` row, uses that
    document's bucket via `imaging_buckets.supabase_storage_slug`
- Uploads bytes to `epdf/<timestamp>_<originalFilename>` in the target bucket
- Updates `epdf_processing_jobs` → `status='completed'`, sets
  `output_storage_path` and `output_file_name`
- If linked to an imaging document, updates `imaging_documents`:
  - `processing_status = 'completed'`
  - `epdf_storage_path = <path>`
  - `storage_path = <public URL>`
- Removes the original pre-conversion file from the bucket
- Inserts an `epdf_usage_logs` row: `{ customer_id, job_id, event_type: 'pdf_processed' }`

### 3.5 On `job.failed`
- Concatenates per-task errors into a single message
- Sets `epdf_processing_jobs.status = 'failed'` with the message
- Sets `imaging_documents.processing_status = 'failed'` if linked

### 3.6 Tables the webhook depends on
The other app's database MUST have these:
- `public.epdf_processing_jobs` (columns: `id`, `customer_id`,
  `cloudconvert_job_id`, `status`, `output_storage_path`, `output_file_name`,
  `error_message`, `updated_at`, `imaging_document_id`)
- `public.imaging_documents` (columns include `processing_status`,
  `epdf_job_id`, `epdf_storage_path`, `storage_path`, `bucket_id`)
- `public.imaging_buckets` (column `supabase_storage_slug`) — this is what
  maps a Parse-It bucket UUID to a real Supabase Storage bucket name
- `public.epdf_usage_logs` (columns: `customer_id`, `job_id`, `event_type`)

Missing any of these → the webhook throws mid-processing, and the job stays
`processing` forever on the other app.

---

## 4. Troubleshooting checklist for the broken Parse-It

Run through this in order on the failing environment. The item most likely to
be wrong is at the top.

1. **Is `cloudconvert-webhook` deployed and public?**
   - MCP: `list_edge_functions` shows it in the list.
   - The function's `verify_jwt` is **false**. If true, redeploy with
     `verify_jwt: false`.

2. **What URL is actually being sent to CloudConvert?**
   Reproduce a job and check the outbound function logs. You should see the
   log line:

   `[trigger-pdf-processing] FULL CloudConvert payload being sent: { ... webhook_url: "https://<PROJECT_REF>.supabase.co/functions/v1/cloudconvert-webhook" ... }`

   If `<PROJECT_REF>` does not match the project the webhook is deployed to,
   `SUPABASE_URL` in the outbound function's env is pointing at the wrong
   project. Fix the secret.

3. **Did CloudConvert accept the job?**
   The outbound log prints `CloudConvert response status: 201/200` and a body
   with `data.id`. If not, the Bearer token is wrong or the payload was
   rejected — the error message is logged verbatim.

4. **Are the webhook events set correctly?**
   In CloudConvert's dashboard (or in the payload itself), confirm
   `webhook_events = ["job.finished", "job.failed"]`. If the other app is
   subscribed to different events, completion callbacks never come.

5. **Is the signing secret matching on both sides?**
   Either:
   - Unset `CLOUDCONVERT_WEBHOOK_SIGNING_SECRET` on the Edge Function so all
     signatures pass, OR
   - Set it to the exact value CloudConvert uses for the webhook.

   MCP: `list_edge_function_secrets` will show whether the secret is set on
   the broken app.

6. **Is the CloudConvert job id being stored?**
   Query on the broken project:

   ```sql
   SELECT id, status, cloudconvert_job_id, updated_at, error_message
   FROM epdf_processing_jobs
   ORDER BY updated_at DESC
   LIMIT 10;
   ```

   Rows should have `status='processing'` and a non-null `cloudconvert_job_id`
   after the outbound call. If the id is null or the row stays `pending`, the
   outbound call never succeeded — go back to step 3.

7. **Is CloudConvert actually calling us?**
   In CloudConvert's dashboard, open the specific Job → Webhooks tab. It
   shows every callback attempt, the HTTP status, and the response body.
   - 401 → verify_jwt on the function, or bad signing secret
   - 404 → wrong `webhook_url` (or webhook function slug renamed)
   - 5xx → open the function's log line by line
   - 200 but nothing changed in the DB → the "No matching job found" branch,
     meaning the `cloudconvert_job_id` in DB doesn't match what was sent

8. **Do the destination tables exist?**
   Confirm each of the four tables listed in section 3.6 exists with the
   listed columns. On this project's DB they all do; verify by running
   `information_schema.columns` filters on the broken DB.

---

## 5. Minimal "smoke test"

On the broken project:

1. Manually invoke `trigger-pdf-processing` with a small public PDF URL:

   ```
   POST https://<broken-project>.supabase.co/functions/v1/trigger-pdf-processing
   Authorization: Bearer <anon or service key that can call it>
   Content-Type: application/json

   { "file_url": "https://www.orimi.com/pdf-test.pdf" }
   ```

2. Watch the outbound function's log. You should see:
   - `Request received`
   - `Job record created: <uuid>`
   - `FULL CloudConvert payload being sent:` — **copy the `webhook_url` and
     paste it into a browser**. It should return a JSON `Missing job data in
     webhook payload` (400) or similar, NOT a 401/404. That proves the URL is
     reachable.
   - `CloudConvert response status: 201`

3. In CloudConvert dashboard → this new job → Webhooks tab, watch for the
   `job.finished` delivery. Confirm HTTP 200 from your endpoint.

4. In the DB, `epdf_processing_jobs` for that job should end at
   `status='completed'`.

If any step diverges, section 4 tells you which piece is off.
