/*
# Add sample_json column to inbox_review_templates

## Summary
Adds a nullable text column to store sample JSON payload on review templates.
This sample is used by the field configuration UI to offer a JSON path picker,
so admins can select paths from real extraction output rather than typing them manually.

## Modified Tables
- `inbox_review_templates`:
  - `sample_json` (text, nullable) — stores a sample JSON string from extraction output

## Security
- No policy changes needed (existing RLS covers all columns).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_review_templates' AND column_name = 'sample_json'
  ) THEN
    ALTER TABLE inbox_review_templates ADD COLUMN sample_json text;
  END IF;
END $$;
