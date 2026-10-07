/*
# Add visibility_condition to inbox_review_fields

1. Modified Tables
   - `inbox_review_fields`
     - `visibility_condition` (jsonb, nullable) — stores conditional visibility rules.
       Format: { "fieldJsonPath": "path.to.field", "operator": "equals|not_equals|contains|not_empty|empty", "value": "comparison_value" }
       When set, the field is only shown if the condition evaluates to true.

2. Notes
   - This enables Phase 4 conditional visibility: show/hide fields based on other field values.
   - A null value means the field is always visible (no condition).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_review_fields' AND column_name = 'visibility_condition'
  ) THEN
    ALTER TABLE inbox_review_fields ADD COLUMN visibility_condition jsonb DEFAULT NULL;
  END IF;
END $$;
