/*
# Add source_email_address to imaging_unindexed_queue

1. Modified Tables
   - `imaging_unindexed_queue`
     - `source_email_address` (text, nullable) - The sender's email address for items received via email monitoring

2. Data Fix
   - Updates existing rows that have a `source_email_config_id` set but `source_type = 'sftp'` to correctly reflect `source_type = 'email'`

3. Important Notes
   - This fixes a bug where items coming through email monitoring were incorrectly saved with source_type = 'sftp'
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_unindexed_queue' AND column_name = 'source_email_address'
  ) THEN
    ALTER TABLE imaging_unindexed_queue ADD COLUMN source_email_address text;
  END IF;
END $$;

-- Fix existing rows: if source_email_config_id is set, source_type should be 'email'
UPDATE imaging_unindexed_queue
SET source_type = 'email'
WHERE source_email_config_id IS NOT NULL AND source_type = 'sftp';
