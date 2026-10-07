/*
# Allow authenticated users to update imaging_documents

1. Problem
   - When indexing a duplicate from the Unindexed batch tab and choosing
     "Use New (Replace)", the client issues an UPDATE on imaging_documents.
   - The existing UPDATE policy required is_admin(), so non-admin users had
     the update filtered out silently, returning 0 rows and causing the
     PostgREST error "Cannot coerce the result to a single JSON object".

2. Changes
   - Drop the admin-only update policy on imaging_documents.
   - Replace with an authenticated-user update policy, matching the
     pattern used for INSERT (see 20260818204346).
   - DELETE remains admin-only (unchanged).
*/

DROP POLICY IF EXISTS "Admins can update imaging_documents" ON imaging_documents;
DROP POLICY IF EXISTS "Authenticated users can update imaging_documents" ON imaging_documents;

CREATE POLICY "Authenticated users can update imaging_documents"
ON imaging_documents FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
);
