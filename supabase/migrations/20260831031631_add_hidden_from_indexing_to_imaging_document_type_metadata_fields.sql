/*
# Add is_hidden_from_indexing to imaging document type metadata field assignments

Lets admins mark an Assigned Meta Field on a Document Type as hidden from the manual
indexing UI (Upload and Unindexed pages). The field remains assigned so workflows and
API updates can still populate it, but users don't see or edit it while indexing.

1. Modified tables
   - `imaging_document_type_metadata_fields`
     - New column `is_hidden_from_indexing boolean NOT NULL DEFAULT false`.
2. Security
   - No policy changes required; existing RLS still applies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'imaging_document_type_metadata_fields'
      AND column_name = 'is_hidden_from_indexing'
  ) THEN
    ALTER TABLE imaging_document_type_metadata_fields
      ADD COLUMN is_hidden_from_indexing boolean NOT NULL DEFAULT false;
  END IF;
END $$;