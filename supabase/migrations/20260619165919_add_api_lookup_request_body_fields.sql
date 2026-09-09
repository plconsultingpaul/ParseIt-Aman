-- Add HTTP method, request body template, request body field mappings, and wrap body in array
-- to order_entry_template_fields for API Lookup field type

ALTER TABLE order_entry_template_fields
  ADD COLUMN IF NOT EXISTS api_lookup_http_method text DEFAULT 'GET',
  ADD COLUMN IF NOT EXISTS api_lookup_request_body text,
  ADD COLUMN IF NOT EXISTS api_lookup_request_body_mappings jsonb,
  ADD COLUMN IF NOT EXISTS api_lookup_wrap_body_in_array boolean DEFAULT false;

-- Also add to order_entry_fields (global config)
ALTER TABLE order_entry_fields
  ADD COLUMN IF NOT EXISTS api_lookup_http_method text DEFAULT 'GET',
  ADD COLUMN IF NOT EXISTS api_lookup_request_body text,
  ADD COLUMN IF NOT EXISTS api_lookup_request_body_mappings jsonb,
  ADD COLUMN IF NOT EXISTS api_lookup_wrap_body_in_array boolean DEFAULT false;
