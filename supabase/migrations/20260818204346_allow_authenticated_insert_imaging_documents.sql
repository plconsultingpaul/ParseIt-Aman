/*
# Allow authenticated users to insert imaging_documents

1. Problem
   - Non-admin users indexing items from the Unindexed tab were hitting
     "new row violates row-level security policy for table imaging_documents"
     because the insert policy required is_admin().
   - Sibling tables (imaging_document_metadata, imaging_batches, imaging_batch_pages)
     already permit any authenticated user to insert.

2. Changes
   - Drop the admin-only insert policy on imaging_documents.
   - Replace with an authenticated-user insert policy, matching the pattern used
     by imaging_document_metadata.
   - Delete/update remain admin-only (unchanged).
   - Service role policy remains (unchanged).
*/

DROP POLICY IF EXISTS "Admins can insert imaging_documents" ON imaging_documents;
DROP POLICY IF EXISTS "Authenticated users can insert imaging_documents" ON imaging_documents;

CREATE POLICY "Authenticated users can insert imaging_documents"
ON imaging_documents FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
);