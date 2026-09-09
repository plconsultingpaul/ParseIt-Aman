-- Create invoice_templates table (replaces per-client invoice_configs)
CREATE TABLE IF NOT EXISTS invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  api_source_type TEXT NOT NULL DEFAULT 'main' CHECK (api_source_type IN ('main', 'secondary')),
  secondary_api_id UUID,
  api_spec_id UUID,
  api_spec_endpoint_id UUID,
  api_path TEXT NOT NULL DEFAULT '',
  http_method TEXT NOT NULL DEFAULT 'GET' CHECK (http_method IN ('GET', 'POST')),
  limit_options NUMERIC[] DEFAULT ARRAY[10, 25, 50, 100]::NUMERIC[],
  order_by_options JSONB DEFAULT '[]'::JSONB,
  default_limit INTEGER NOT NULL DEFAULT 25,
  default_order_by TEXT,
  default_order_direction TEXT NOT NULL DEFAULT 'desc' CHECK (default_order_direction IN ('asc', 'desc')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_templates" ON invoice_templates FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_templates" ON invoice_templates FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_templates" ON invoice_templates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_templates" ON invoice_templates FOR DELETE
  TO authenticated USING (true);

-- Create invoice_template_fields table
CREATE TABLE IF NOT EXISTS invoice_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES invoice_templates(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL CHECK (field_type IN ('filter', 'select')),
  field_name TEXT NOT NULL,
  display_label TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'date', 'boolean')),
  filter_operator TEXT,
  parameter_type TEXT,
  api_field_path TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  field_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  value_mappings JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_template_fields" ON invoice_template_fields FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_template_fields" ON invoice_template_fields FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_template_fields" ON invoice_template_fields FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_template_fields" ON invoice_template_fields FOR DELETE
  TO authenticated USING (true);

-- Create invoice_template_default_fields table
CREATE TABLE IF NOT EXISTS invoice_template_default_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES invoice_templates(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  parameter_type TEXT NOT NULL DEFAULT 'query',
  api_field_path TEXT,
  value_type TEXT NOT NULL DEFAULT 'static' CHECK (value_type IN ('static', 'dynamic')),
  static_value TEXT,
  dynamic_value TEXT,
  operator TEXT NOT NULL DEFAULT 'eq',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_template_default_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_template_default_fields" ON invoice_template_default_fields FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_template_default_fields" ON invoice_template_default_fields FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_template_default_fields" ON invoice_template_default_fields FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_template_default_fields" ON invoice_template_default_fields FOR DELETE
  TO authenticated USING (true);

-- Create invoice_template_filter_presets table
CREATE TABLE IF NOT EXISTS invoice_template_filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES invoice_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  filter_values JSONB DEFAULT '[]'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_template_filter_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_invoice_template_filter_presets" ON invoice_template_filter_presets FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_invoice_template_filter_presets" ON invoice_template_filter_presets FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_invoice_template_filter_presets" ON invoice_template_filter_presets FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_invoice_template_filter_presets" ON invoice_template_filter_presets FOR DELETE
  TO authenticated USING (true);

-- Add invoice_template_id to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS invoice_template_id UUID REFERENCES invoice_templates(id) ON DELETE SET NULL;
