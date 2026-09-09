/*
# Add API Lookup field type support to Execute Button Fields

1. Modified Tables
  - `execute_button_fields`
    - `api_lookup_endpoint` (text, nullable) - API path to call for fetching results
    - `api_lookup_secondary_api_id` (uuid, nullable) - optional secondary API connection
    - `api_lookup_spec_id` (uuid, nullable) - optional API spec for endpoint selection
    - `api_lookup_http_method` (text, default 'GET') - HTTP method (GET/POST/PUT/PATCH)
    - `api_lookup_search_param` (text, nullable) - query parameter name for search term
    - `api_lookup_value_field` (text, nullable) - response field to use as the field value
    - `api_lookup_display_columns` (jsonb, nullable) - columns shown in results table
    - `api_lookup_field_mappings` (jsonb, nullable) - maps response fields to sibling fields
    - `api_lookup_request_body` (text, nullable) - JSON template for POST/PUT/PATCH body
    - `api_lookup_request_body_mappings` (jsonb, nullable) - maps fields into request body
    - `api_lookup_wrap_body_in_array` (boolean, default false) - wraps body in an array

2. Notes
  - These columns mirror the api_lookup feature from order_entry_template_fields
  - Allows Execute Flow fields to show a dropdown populated from an API endpoint
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_endpoint') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_endpoint text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_secondary_api_id') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_secondary_api_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_spec_id') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_spec_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_http_method') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_http_method text DEFAULT 'GET';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_search_param') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_search_param text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_value_field') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_value_field text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_display_columns') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_display_columns jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_field_mappings') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_field_mappings jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_request_body') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_request_body text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_request_body_mappings') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_request_body_mappings jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execute_button_fields' AND column_name = 'api_lookup_wrap_body_in_array') THEN
    ALTER TABLE execute_button_fields ADD COLUMN api_lookup_wrap_body_in_array boolean DEFAULT false;
  END IF;
END $$;