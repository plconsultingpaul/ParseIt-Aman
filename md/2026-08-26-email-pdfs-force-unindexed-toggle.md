# Send Email PDFs Straight to the Unindexed Queue (Batch vs. Single)

**Date:** 2026-08-26

## What was changed

Added a new **"Send All Email PDFs to Unindexed Queue"** toggle to each email account under **Imaging Settings → Provider Configuration**.

### Behavior when the toggle is ON for an email account
- Every PDF attachment pulled from that email is routed straight to the imaging Unindexed area, bypassing subject and barcode rules.
- **Multi-page PDF (2+ pages):** added to the imaging Batches list, with the full page count already recorded and the source shown as the sender's email address. Users can then split the batch page-by-page like any manually-uploaded batch.
- **Single-page PDF (1 page):** added to the Unindexed Queue as an individual item, just like today's "no pattern match" fallback.
- The PDF is still uploaded to the bucket's storage and still runs through CloudConvert/OCR, so the file remains searchable.

### Behavior when the toggle is OFF
- No change to current behavior. Subject rules, barcode rules, and the normal indexed/unindexed decision run exactly as before. Existing email accounts keep the toggle off by default.

## Where the change lives (technical summary)

- **Database:** added `force_to_unindexed_queue boolean not null default false` to `imaging_email_monitoring_config` (additive migration; no existing data affected).
- **Type + service mapping:** added `forceToUnindexedQueue` to `ImagingEmailMonitoringConfig`, and the corresponding read/write mapping in `imagingService.ts`.
- **UI:** new toggle row underneath "Check All Messages" in `ImagingEmailMonitoringSection.tsx`, matching the existing toggle styling, with helper text explaining the batch/single split.
- **Email runtime (`supabase/functions/imaging-email-monitor`):** reads the new flag and forwards it (plus `pageCount` and the sender's email address) to the processor. Workflow-v2 rule invocation is skipped for that account while the flag is on.
- **Processor runtime (`supabase/functions/imaging-sftp-processor`):** when `forceUnindexed` is set, uploads the PDF to storage, skips barcode/pattern matching, then inserts into `imaging_batches` (for `pageCount > 1`, with `source_type = 'email'`, `bucket_id`, `source_email_config_id`, `source_email_address`, `total_pages`) or `imaging_unindexed_queue` (for single-page PDFs). CloudConvert is still triggered in both cases.

Both edge functions were re-deployed. `npm run build` passes cleanly.
