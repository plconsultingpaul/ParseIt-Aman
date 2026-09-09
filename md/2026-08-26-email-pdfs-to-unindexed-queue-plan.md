# Plan: Route Email-Sourced PDFs to the Unindexed Queue

**Date:** 2026-08-26
**Requested behavior:** In Imaging Settings → Provider Configuration, add a toggle that, when enabled, sends every PDF pulled from a monitored email straight into the Unindexed Queue instead of running the normal indexing path. Multi-page PDFs must land as a **Batch**; single-page PDFs must land as a **single** unindexed item. When the toggle is off, current behavior is unchanged.

---

## 1. Where the current flow lives

- **UI:** `src/components/imaging/ImagingEmailMonitoringSection.tsx` — this is the "Email Provider Configuration" panel the user is referring to. Toggles/text fields on this form are persisted per-account into `imaging_email_monitoring_config`.
- **Type + service layer:** `ImagingEmailMonitoringConfig` in `src/types/index.ts`; DB mapping in `src/services/imagingService.ts` (`mapEmailConfig` + `configToDbData`).
- **Runtime that pulls the emails:** `supabase/functions/imaging-email-monitor/index.ts`. For each PDF attachment it already computes `pageCount` (via `getPdfPageCount`) and then hands the base64 PDF to `imaging-sftp-processor` (misnamed — it's the shared "PDF-into-imaging" pipeline for both SFTP and email).
- **Where "indexed vs unindexed" is decided today:** `supabase/functions/imaging-sftp-processor/index.ts`. If the filename/barcode matches a document-type rule it becomes an indexed `imaging_documents` row; otherwise it is inserted into `imaging_unindexed_queue` (always as a single item — the processor does not know about batches).
- **Batch tables already exist:** `imaging_batches` (+ `imaging_batch_pages`), with `source_type` (`'upload' | 'email' | 'sftp'`), `source_email_address`, `source_email_config_id`, and `bucket_id` columns already added in migration `20260817025800_add_source_tracking_to_imaging_batches.sql`. So the DB is ready — nothing new is needed on the batches side except writes from the email path.
- **Storage:** the sftp-processor already uploads the PDF bytes to the bucket's Supabase storage slug and returns a `storagePath`. That same upload can back either a single unindexed row or a batch row.

---

## 2. What the toggle needs to do

Add one new setting on `imaging_email_monitoring_config`, exposed in the Provider Configuration UI:

- **Column:** `force_to_unindexed_queue boolean not null default false`.
- **Label in UI (under the existing "Check All Messages" toggle in `ImagingEmailMonitoringSection.tsx`):** "Send all email PDFs to Unindexed Queue" with a helper line: "Multi-page PDFs are added as a Batch; single-page PDFs are added as a single item."

When this flag is **off** → current behavior (subject rule → workflow, else pattern-match to `imaging_documents`, else unindexed).

When this flag is **on** for that email account → every PDF attachment bypasses subject rules, barcode rules, and the doc-type auto-match, and is routed as follows:
- `pageCount === 1` → insert one row into `imaging_unindexed_queue` (existing behavior, minus the pattern-match attempt).
- `pageCount > 1` → insert one row into `imaging_batches` with `source_type = 'email'`, `source_email_config_id = <configId>`, `source_email_address = <from>`, `bucket_id = <effective bucketId>`, `total_pages = pageCount`, `status = 'in_progress'`, `indexed_count = 0`. The PDF is stored once in the bucket's storage slug; page rows in `imaging_batch_pages` are created lazily by the existing batch UI when a user opens the batch, matching how manually-uploaded batches work today. (Alternative option: eagerly split into per-page rows here — I recommend NOT doing this, because the existing upload flow doesn't split up front either, and doing it in an edge function would require running `pdf-lib` per page per email PDF.)

Either way, CloudConvert EPDF processing continues to trigger for the stored PDF, so the file is still searchable.

---

## 3. Concrete change list (no code written yet)

**a. Database migration** (single file, additive, safe):
- `ALTER TABLE imaging_email_monitoring_config ADD COLUMN IF NOT EXISTS force_to_unindexed_queue boolean NOT NULL DEFAULT false;`
- No RLS changes needed — existing policies on the table already cover the new column. No changes to `imaging_batches` / `imaging_unindexed_queue` — the columns we need are already there.

**b. Types + service mapping** (`src/types/index.ts`, `src/services/imagingService.ts`):
- Add `forceToUnindexedQueue: boolean` to `ImagingEmailMonitoringConfig`.
- In `mapEmailConfig`: read `c.force_to_unindexed_queue`.
- In `configToDbData`: write `force_to_unindexed_queue`.
- In `newBlankConfig()` inside `ImagingEmailMonitoringSection.tsx`: default `false`.

**c. UI** (`src/components/imaging/ImagingEmailMonitoringSection.tsx`):
- Add one more toggle row underneath the existing "Check All Messages" toggle, styled identically (label + `ToggleLeft/ToggleRight`), bound to `config.forceToUnindexedQueue`. Include the one-line helper text.

**d. Runtime — the actual routing** (`supabase/functions/imaging-email-monitor/index.ts`):
- Extend the `ImagingEmailConfig` interface to include `force_to_unindexed_queue: boolean`.
- Inside the per-PDF loop, **before** the current call to `imaging-sftp-processor`:
  - If `config.force_to_unindexed_queue` is `true`, do NOT call `imaging-sftp-processor` with the normal routing. Instead call it (or a new small helper) in a mode that only uploads the file and returns the `storagePath` + `hasTextLayer`, without pattern-matching. Then:
    - If `pdf.pageCount === 1`: insert into `imaging_unindexed_queue` directly using `bucket_id = effectiveBucketId`, `storage_path`, `original_filename`, `source_type = 'email'`, `source_email_address = email.from`.
    - If `pdf.pageCount > 1`: insert into `imaging_batches` with the fields listed in §2.
  - Trigger `trigger-pdf-processing` (CloudConvert) exactly like the sftp-processor does today, so EPDFs are still generated.
  - Increment `unindexedCount` (existing counter) for both cases so the "Run Now" summary line the operator already sees still makes sense.

The cleanest split is to introduce a new **`mode` parameter** on `imaging-sftp-processor` (`'auto' | 'force_unindexed'`). `'auto'` is today's behavior (default, keeps current callers untouched); `'force_unindexed'` skips subject/barcode/pattern rules and branches on `pageCount` between the queue table and the batches table. That keeps the batch/single decision co-located with the storage upload it already performs, and keeps the email monitor thin. This is the recommended approach.

**e. No changes needed** in the UI that lists the Unindexed Queue and Batches — both tables are already read by `ImagingUnindexedTab.tsx` / batch views, and new rows created from email will show up automatically because the `source_type` filtering (if any) already accepts `'email'`.

---

## 4. Edge cases the implementation must cover

- **Encrypted/broken PDF where `pdf-lib` can't read pages:** the existing `getPdfPageCount` returns `1` on failure. That is fine — such a PDF will go in as a single unindexed item, not a broken batch.
- **Password-protected PDFs:** same fallback (`ignoreEncryption: true` is already set); if page count still fails it lands as single.
- **Bucket missing:** the monitor already skips the whole email account if `imaging_bucket_id` is null, so no extra guard needed for the new path.
- **Attachment matching a barcode/subject rule:** when the toggle is on, we must NOT invoke Workflow V2 either. The plan explicitly bypasses `subjectMatch`/`barcodeRules` for that config. Rule authors should be warned in the UI helper text ("Rules are ignored when this is on"). I'd add that half-sentence to the helper copy.
- **CloudConvert EPDF processing:** keep triggering it so the file remains searchable, matching current unindexed behavior.
- **Post-processing action on the source email:** unchanged. Success/failure counters still drive the mark-as-read / move / delete step at the end of the email loop.

---

## 5. Estimated impact

- **1 migration file** (one additive column).
- **~4 line change** in `imagingService.ts` mapping.
- **~1 line change** in `types/index.ts`.
- **~10-line UI addition** in `ImagingEmailMonitoringSection.tsx` (toggle + helper text + blank-config default).
- **~40-line addition** in `imaging-email-monitor/index.ts` for the branch.
- **~30-line addition** in `imaging-sftp-processor/index.ts` for the new `mode: 'force_unindexed'` branch (upload + choose queue vs batch + insert + CloudConvert trigger).

No breaking changes to existing accounts. Existing accounts keep the same behavior because the new column defaults to `false`.

---

## 6. Open questions worth confirming before building

1. When a multi-page email PDF creates a batch, should the batch show up under a specific `created_by` user? Manual batches use the logged-in user; email-sourced batches have no user. Recommend `created_by = NULL` (already allowed by the schema) and letting the UI show "Email: sender@x.com" using the existing `source_email_address` column — the batch list should already handle this per the source-tracking migration.
2. Do you want per-account control (toggle on `imaging_email_monitoring_config`, which is what I described) or a single global switch under Imaging Settings? Per-account matches the wording of the request ("some Parse-It customers might not want this" — but customers themselves each have their own config). I recommend per-account.
3. Should barcode detection still run when the toggle is on (for future reporting), or be skipped entirely to save CPU? Recommend skipping.

If you confirm the recommended answers to those three, this is straightforward to build in one pass.
