ALTER TABLE address_book_import_config
  ADD COLUMN IF NOT EXISTS api_source_type text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS secondary_api_id uuid REFERENCES secondary_api_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS api_spec_id uuid,
  ADD COLUMN IF NOT EXISTS api_spec_endpoint_id uuid,
  ADD COLUMN IF NOT EXISTS http_method text NOT NULL DEFAULT 'GET';