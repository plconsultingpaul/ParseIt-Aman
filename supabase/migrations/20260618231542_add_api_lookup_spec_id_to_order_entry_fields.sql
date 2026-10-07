-- Add api_lookup_spec_id column to store selected specification
ALTER TABLE order_entry_template_fields
  ADD COLUMN IF NOT EXISTS api_lookup_spec_id uuid DEFAULT NULL;

COMMENT ON COLUMN order_entry_template_fields.api_lookup_spec_id IS 'Selected API specification for endpoint picker';