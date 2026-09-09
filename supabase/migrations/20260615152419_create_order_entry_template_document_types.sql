CREATE TABLE order_entry_template_document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES order_entry_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  action_type TEXT NOT NULL DEFAULT 'email',
  email_recipients TEXT,
  email_subject_template TEXT,
  imaging_bucket_id UUID,
  imaging_document_type_id UUID,
  rename_template TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_entry_template_document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_document_types" ON order_entry_template_document_types FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_document_types" ON order_entry_template_document_types FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_document_types" ON order_entry_template_document_types FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_document_types" ON order_entry_template_document_types FOR DELETE
  TO authenticated USING (true);