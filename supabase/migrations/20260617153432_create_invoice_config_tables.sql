-- Invoice configuration tables (mirrors Track & Trace pattern)

-- Main invoice config per client
CREATE TABLE IF NOT EXISTS invoice_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  api_source_type text NOT NULL DEFAULT 'main',
  secondary_api_id uuid REFERENCES secondary_api_configs(id),
  api_spec_id uuid REFERENCES api_specs(id),
  api_spec_endpoint_id uuid REFERENCES api_spec_endpoints(id),
  api_path text NOT NULL DEFAULT '',
  http_method text NOT NULL DEFAULT 'GET',
  limit_options integer[] NOT NULL DEFAULT '{10,25,50,100}',
  order_by_options jsonb NOT NULL DEFAULT '[]',
  default_limit integer NOT NULL DEFAULT 25,
  default_order_by text,
  default_order_direction text NOT NULL DEFAULT 'desc',
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE invoice_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_configs" ON invoice_configs FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_configs" ON invoice_configs FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_configs" ON invoice_configs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_configs" ON invoice_configs FOR DELETE
  TO authenticated USING (true);

-- Invoice fields (filter + select columns)
CREATE TABLE IF NOT EXISTS invoice_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES invoice_configs(id) ON DELETE CASCADE,
  field_type text NOT NULL CHECK (field_type IN ('filter', 'select')),
  field_name text NOT NULL,
  display_label text NOT NULL,
  data_type text NOT NULL DEFAULT 'string',
  filter_operator text,
  parameter_type text DEFAULT 'query',
  api_field_path text,
  is_required boolean NOT NULL DEFAULT false,
  field_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  value_mappings jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_fields" ON invoice_fields FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_fields" ON invoice_fields FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_fields" ON invoice_fields FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_fields" ON invoice_fields FOR DELETE
  TO authenticated USING (true);

-- Invoice default fields (pre-set filter values)
CREATE TABLE IF NOT EXISTS invoice_default_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES invoice_configs(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  parameter_type text NOT NULL DEFAULT 'query',
  api_field_path text,
  value_type text NOT NULL DEFAULT 'static',
  static_value text,
  dynamic_value text,
  operator text NOT NULL DEFAULT 'eq',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_default_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_default_fields" ON invoice_default_fields FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_default_fields" ON invoice_default_fields FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_default_fields" ON invoice_default_fields FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_default_fields" ON invoice_default_fields FOR DELETE
  TO authenticated USING (true);

-- Invoice filter presets (quick filter buttons)
CREATE TABLE IF NOT EXISTS invoice_filter_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES invoice_configs(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  filter_values jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_filter_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_filter_presets" ON invoice_filter_presets FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_filter_presets" ON invoice_filter_presets FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_filter_presets" ON invoice_filter_presets FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_filter_presets" ON invoice_filter_presets FOR DELETE
  TO authenticated USING (true);

-- Add invoice_config_id to clients table for linking
ALTER TABLE clients ADD COLUMN IF NOT EXISTS invoice_config_id uuid REFERENCES invoice_configs(id);
