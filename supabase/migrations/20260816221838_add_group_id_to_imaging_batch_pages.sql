/*
# Add group_id column to imaging_batch_pages

1. Modified Tables
  - `imaging_batch_pages`
    - `group_id` (text, nullable) - When set, pages sharing the same group_id within a batch
      will be combined into a single PDF on completion, regardless of page order or metadata match.
      Allows explicit multi-page document grouping (e.g. a 3-page BOL indexed as one document).

2. Notes
  - Pages without a group_id continue to use the existing auto-grouping logic
    (consecutive indexed pages with matching bucket/docType/metadata are merged).
  - Pages WITH a group_id are always combined into one document, using the indexing data
    from the first page in the group (lowest page_number).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imaging_batch_pages' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE imaging_batch_pages ADD COLUMN group_id text;
  END IF;
END $$;
