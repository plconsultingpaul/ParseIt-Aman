/*
# Flip Review Template <-> Extraction Type Relationship

## Summary
Previously each inbox_review_template was linked to exactly one extraction_type via
a NOT NULL extraction_type_id column. This migration flips the relationship so that
extraction types point to a shared review template instead.

## Changes

1. Modified Tables:
   - `inbox_review_templates`:
     - `extraction_type_id` made NULLABLE (was NOT NULL). Retained for backwards compat but no longer authoritative.
     - `is_default` (boolean, default false) added — marks the fallback template used when an extraction type has no explicit selection.
   - `extraction_types`:
     - `inbox_review_template_id` (uuid, nullable) added — FK to inbox_review_templates(id) ON DELETE SET NULL.

2. Indexes:
   - idx_extraction_types_inbox_review_template on extraction_types(inbox_review_template_id)

3. Security: No policy changes (existing RLS covers these columns).

## Important Notes
1. Multiple extraction types can now reference the same review template.
2. Only one template should be marked is_default=true at a time (enforced in app logic).
3. The old extraction_type_id column is kept nullable for data continuity but is no longer the source of truth.
*/

-- Make extraction_type_id nullable on inbox_review_templates
ALTER TABLE inbox_review_templates ALTER COLUMN extraction_type_id DROP NOT NULL;

-- Add is_default column to inbox_review_templates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_review_templates' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE inbox_review_templates ADD COLUMN is_default boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add inbox_review_template_id to extraction_types
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extraction_types' AND column_name = 'inbox_review_template_id'
  ) THEN
    ALTER TABLE extraction_types ADD COLUMN inbox_review_template_id uuid REFERENCES inbox_review_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_extraction_types_inbox_review_template
  ON extraction_types(inbox_review_template_id);
