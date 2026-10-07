/*
# Add duplicate handling settings to imaging document types

This migration lets each document type decide whether the system should
allow more than one indexed document sharing the same bill number in the
same bucket, and what to do when a duplicate is detected.

1. Modified table: imaging_document_types
   - allow_duplicates (boolean, default true) — when true, the current
     behavior is preserved and duplicates are always allowed.
   - duplicate_manual_action (text, default 'prompt') — action to take
     when a duplicate is detected during a manual/browser upload.
     Allowed values: 'keep_existing', 'use_new', 'prompt'.
   - duplicate_email_action (text, default 'keep_existing') — action to
     take when a duplicate is detected during automated ingestion
     (email monitor, SFTP polling, ePDF finalization, etc.).
     Allowed values: 'keep_existing', 'use_new'.

2. Index
   - New index on imaging_documents (bucket_id, document_type_id,
     bill_number) to make the duplicate lookup fast.

3. Security
   - No changes to RLS. Existing policies continue to apply.

4. Notes
   - Existing document types default to allow_duplicates = true so this
     migration is backwards-compatible.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_document_types' AND column_name = 'allow_duplicates'
  ) THEN
    ALTER TABLE imaging_document_types
      ADD COLUMN allow_duplicates boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_document_types' AND column_name = 'duplicate_manual_action'
  ) THEN
    ALTER TABLE imaging_document_types
      ADD COLUMN duplicate_manual_action text NOT NULL DEFAULT 'prompt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_document_types' AND column_name = 'duplicate_email_action'
  ) THEN
    ALTER TABLE imaging_document_types
      ADD COLUMN duplicate_email_action text NOT NULL DEFAULT 'keep_existing';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'imaging_document_types_duplicate_manual_action_check'
  ) THEN
    ALTER TABLE imaging_document_types
      ADD CONSTRAINT imaging_document_types_duplicate_manual_action_check
      CHECK (duplicate_manual_action IN ('keep_existing', 'use_new', 'prompt'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'imaging_document_types_duplicate_email_action_check'
  ) THEN
    ALTER TABLE imaging_document_types
      ADD CONSTRAINT imaging_document_types_duplicate_email_action_check
      CHECK (duplicate_email_action IN ('keep_existing', 'use_new'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS imaging_documents_dup_lookup_idx
  ON imaging_documents (bucket_id, document_type_id, bill_number);
