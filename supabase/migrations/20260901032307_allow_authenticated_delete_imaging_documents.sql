DROP POLICY IF EXISTS "Admins can delete imaging_documents" ON imaging_documents;

CREATE POLICY "Authenticated users can delete imaging_documents"
  ON imaging_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
    )
  );