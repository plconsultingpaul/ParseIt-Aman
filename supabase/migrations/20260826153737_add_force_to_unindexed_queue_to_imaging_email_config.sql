/*
  # Add force-to-unindexed-queue toggle to imaging email monitoring config

  ## Summary
  Adds a per-account boolean toggle to `imaging_email_monitoring_config` that,
  when enabled, forces every PDF pulled from that email account into the
  Unindexed Queue (single-page PDFs) or as a Batch (multi-page PDFs), bypassing
  the normal subject/barcode/pattern-match routing.

  ## Changes
  - `imaging_email_monitoring_config`
    - `force_to_unindexed_queue` (boolean, not null, default false)

  ## Notes
  - Additive only. Existing rows default to `false`, preserving current behavior.
  - No RLS changes needed; existing policies on the table already cover the new column.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_email_monitoring_config'
      AND column_name = 'force_to_unindexed_queue'
  ) THEN
    ALTER TABLE imaging_email_monitoring_config
      ADD COLUMN force_to_unindexed_queue boolean NOT NULL DEFAULT false;
  END IF;
END $$;
