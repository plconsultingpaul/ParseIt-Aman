/*
# Add default_value to inbox_review_fields

## Summary
Adds a `default_value` column to the `inbox_review_fields` table so that when a user adds
a new row to an array group in the Inbox Review form, each field can be pre-populated with
a configured default value instead of being blank.

## Modified Tables
- `inbox_review_fields`
  - `default_value` (text, nullable) — the value to populate when a new array row is added;
    differs from `placeholder` which is only a visual hint and does not set the actual value.

## Notes
- This column is nullable; existing fields will have NULL (no default), preserving current behavior.
- The column is idempotent (uses DO block with IF NOT EXISTS check).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_review_fields' AND column_name = 'default_value'
  ) THEN
    ALTER TABLE inbox_review_fields ADD COLUMN default_value text;
  END IF;
END $$;
