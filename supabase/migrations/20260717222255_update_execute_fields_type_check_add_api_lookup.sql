/*
# Update field_type check constraint to include api_lookup

1. Modified Tables
  - `execute_button_fields`
    - Updated CHECK constraint to allow 'api_lookup' as a valid field_type value

2. Notes
  - Required for the API Lookup field type feature added to Execute Flow
*/

ALTER TABLE execute_button_fields DROP CONSTRAINT execute_button_fields_field_type_check;

ALTER TABLE execute_button_fields ADD CONSTRAINT execute_button_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['text','number','decimal','date','datetime','phone','zip','postal_code','province','state','dropdown','email','checkbox','time','api_lookup']));