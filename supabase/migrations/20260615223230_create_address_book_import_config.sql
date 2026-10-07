CREATE TABLE IF NOT EXISTS address_book_import_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_endpoint text NOT NULL,
  api_parameter_name text NOT NULL DEFAULT 'clientId',
  api_parameter_type text NOT NULL DEFAULT 'path',
  field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE address_book_import_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_address_book_import_config" ON address_book_import_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_address_book_import_config" ON address_book_import_config
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_address_book_import_config" ON address_book_import_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_address_book_import_config" ON address_book_import_config
  FOR DELETE TO authenticated USING (true);