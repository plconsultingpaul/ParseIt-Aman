CREATE TABLE order_entry_submission_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES order_entry_submissions(id) ON DELETE CASCADE,
  document_type_id UUID REFERENCES order_entry_template_document_types(id),
  document_type_name TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  renamed_file_name TEXT,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  action_type TEXT NOT NULL DEFAULT 'email',
  action_status TEXT NOT NULL DEFAULT 'pending',
  action_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_entry_submission_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_submission_documents" ON order_entry_submission_documents FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM order_entry_submissions s WHERE s.id = submission_id AND s.user_id = auth.uid())
  );
CREATE POLICY "insert_own_submission_documents" ON order_entry_submission_documents FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM order_entry_submissions s WHERE s.id = submission_id AND s.user_id = auth.uid())
  );
CREATE POLICY "update_own_submission_documents" ON order_entry_submission_documents FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM order_entry_submissions s WHERE s.id = submission_id AND s.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM order_entry_submissions s WHERE s.id = submission_id AND s.user_id = auth.uid())
  );
CREATE POLICY "delete_own_submission_documents" ON order_entry_submission_documents FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM order_entry_submissions s WHERE s.id = submission_id AND s.user_id = auth.uid())
  );

CREATE POLICY "admin_select_submission_documents" ON order_entry_submission_documents FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "admin_insert_submission_documents" ON order_entry_submission_documents FOR INSERT
  TO authenticated WITH CHECK (true);