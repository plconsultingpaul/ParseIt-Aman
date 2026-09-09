-- Add API Lookup configuration columns to order_entry_template_fields
ALTER TABLE order_entry_template_fields
  ADD COLUMN IF NOT EXISTS api_lookup_endpoint text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_lookup_secondary_api_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_lookup_display_columns jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_lookup_value_field text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_lookup_field_mappings jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_lookup_search_param text DEFAULT NULL;

COMMENT ON COLUMN order_entry_template_fields.api_lookup_endpoint IS 'API path to call for lookup results';
COMMENT ON COLUMN order_entry_template_fields.api_lookup_secondary_api_id IS 'Optional secondary API to use instead of primary';
COMMENT ON COLUMN order_entry_template_fields.api_lookup_display_columns IS 'JSON array of {field, label} objects for result table columns';
COMMENT ON COLUMN order_entry_template_fields.api_lookup_value_field IS 'Which response field becomes this field value';
COMMENT ON COLUMN order_entry_template_fields.api_lookup_field_mappings IS 'JSON array of {responseField, targetFieldName} for populating sibling fields';
COMMENT ON COLUMN order_entry_template_fields.api_lookup_search_param IS 'Query parameter name for search filtering';