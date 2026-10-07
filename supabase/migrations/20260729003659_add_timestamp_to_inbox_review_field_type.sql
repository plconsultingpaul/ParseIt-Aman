/*
# Add 'timestamp' to inbox_review_fields field_type constraint

1. Modified Tables
   - `inbox_review_fields`
     - Updated `field_type` CHECK constraint to include 'timestamp' alongside existing values
       (text, number, date, dropdown, boolean, readonly).

2. Important Notes
   - The 'timestamp' field type allows selecting both a date and a time.
   - Existing data is unaffected — this only expands the allowed values.
*/

ALTER TABLE inbox_review_fields
  DROP CONSTRAINT IF EXISTS inbox_review_fields_field_type_check;

ALTER TABLE inbox_review_fields
  ADD CONSTRAINT inbox_review_fields_field_type_check
  CHECK (field_type IN ('text', 'number', 'date', 'timestamp', 'dropdown', 'boolean', 'readonly'));
