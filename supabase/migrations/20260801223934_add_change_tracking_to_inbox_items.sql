/*
# Track field edits made during Inbox review

Adds the ability to record which fields a reviewer changed when they Accept an
inbox item, so the Accepted list can flag edited items and the detail view can
show a full old-value / new-value change log.

1. Modified Tables
   - `inbox_items`
     - `has_edits` (boolean, not null, default false) — true when the reviewer
       changed one or more field values before accepting the item.
     - `change_log` (jsonb, nullable) — an ordered list of the fields that were
       changed at Accept time. Each entry is an object of the shape
       { path, label, oldValue, newValue }. Captured once at acceptance so it
       is a permanent audit record with the field labels shown at that time.

2. Security
   - No RLS changes. Existing policies on `inbox_items` continue to apply to the
     new columns.

3. Important Notes
   1. Both columns are additive and nullable/defaulted, so existing rows are
      unaffected and no data is lost.
   2. Only the Accept flow populates these columns; rejected items are not
      tracked here by design.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_items' AND column_name = 'has_edits'
  ) THEN
    ALTER TABLE inbox_items ADD COLUMN has_edits boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_items' AND column_name = 'change_log'
  ) THEN
    ALTER TABLE inbox_items ADD COLUMN change_log jsonb;
  END IF;
END $$;