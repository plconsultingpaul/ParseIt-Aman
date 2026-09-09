/*
# Add source tracking to imaging_batches

1. Modified Tables
   - `imaging_batches`
     - `source_type` (text, not null, default 'upload') - Where this batch originated: 'upload', 'email', or 'sftp'
     - `source_email_address` (text, nullable) - The sender's email address when source_type = 'email'
     - `source_email_config_id` (uuid, nullable) - FK to imaging_email_monitoring_config for email-sourced batches
     - `bucket_id` (uuid, nullable) - The target imaging bucket for email/sftp-sourced batches

2. Important Notes
   - Enables multi-page PDFs from email monitoring to enter the system as batches
     instead of single unindexed queue items, so users can index them page-by-page
   - Existing batches (from manual upload) will default to source_type = 'upload'
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_batches' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE imaging_batches ADD COLUMN source_type text NOT NULL DEFAULT 'upload';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_batches' AND column_name = 'source_email_address'
  ) THEN
    ALTER TABLE imaging_batches ADD COLUMN source_email_address text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_batches' AND column_name = 'source_email_config_id'
  ) THEN
    ALTER TABLE imaging_batches ADD COLUMN source_email_config_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_batches' AND column_name = 'bucket_id'
  ) THEN
    ALTER TABLE imaging_batches ADD COLUMN bucket_id uuid;
  END IF;
END $$;