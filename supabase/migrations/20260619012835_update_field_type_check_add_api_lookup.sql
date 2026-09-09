
ALTER TABLE order_entry_template_fields
  DROP CONSTRAINT order_entry_template_fields_field_type_check;

ALTER TABLE order_entry_template_fields
  ADD CONSTRAINT order_entry_template_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'datetime'::text, 'phone'::text, 'dropdown'::text, 'file'::text, 'boolean'::text, 'zip'::text, 'postal_code'::text, 'zip_postal'::text, 'province'::text, 'state'::text, 'api_lookup'::text]));
