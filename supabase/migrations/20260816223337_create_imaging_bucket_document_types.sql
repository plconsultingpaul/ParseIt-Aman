/*
# Create imaging bucket document types junction table

1. New Tables
  - `imaging_bucket_document_types`
    - `id` (uuid, primary key)
    - `bucket_id` (uuid, FK to imaging_buckets, CASCADE delete)
    - `document_type_id` (uuid, FK to imaging_document_types, CASCADE delete)
    - `created_at` (timestamptz)
    - Unique constraint on (bucket_id, document_type_id)

2. Purpose
  - Links storage buckets to allowed document types.
  - When a bucket has assignments, only those document types appear in the indexing dropdown.
  - Buckets with no assignments show all document types (backward compatible).

3. Security
  - RLS enabled with anon + authenticated CRUD (matches existing imaging tables pattern).
*/

CREATE TABLE IF NOT EXISTS imaging_bucket_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id uuid NOT NULL REFERENCES imaging_buckets(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES imaging_document_types(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bucket_id, document_type_id)
);

ALTER TABLE imaging_bucket_document_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bucket_doc_types" ON imaging_bucket_document_types;
CREATE POLICY "anon_select_bucket_doc_types" ON imaging_bucket_document_types FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bucket_doc_types" ON imaging_bucket_document_types;
CREATE POLICY "anon_insert_bucket_doc_types" ON imaging_bucket_document_types FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bucket_doc_types" ON imaging_bucket_document_types;
CREATE POLICY "anon_update_bucket_doc_types" ON imaging_bucket_document_types FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bucket_doc_types" ON imaging_bucket_document_types;
CREATE POLICY "anon_delete_bucket_doc_types" ON imaging_bucket_document_types FOR DELETE
  TO anon, authenticated USING (true);
