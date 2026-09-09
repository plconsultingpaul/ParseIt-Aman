ALTER TABLE extraction_type_array_entry_fields
  DROP CONSTRAINT extraction_type_array_entry_fields_field_type_check;

ALTER TABLE extraction_type_array_entry_fields
  ADD CONSTRAINT extraction_type_array_entry_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['hardcoded'::text, 'extracted'::text, 'mapped'::text, 'order_entry'::text]));