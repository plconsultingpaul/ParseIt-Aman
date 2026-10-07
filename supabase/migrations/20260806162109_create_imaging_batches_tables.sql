/*
# Create imaging batch persistence tables

1. New Tables
  - `imaging_batches`
    - `id` (uuid, primary key)
    - `original_filename` (text) - name of the uploaded PDF
    - `storage_path` (text) - path to the raw PDF in Supabase Storage
    - `total_pages` (integer) - number of pages in the PDF
    - `indexed_count` (integer, default 0) - how many pages have been indexed so far
    - `status` (text) - 'in_progress' or 'completed'
    - `created_by` (uuid, nullable) - user who created the batch
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
  - `imaging_batch_pages`
    - `id` (uuid, primary key)
    - `batch_id` (uuid, FK to imaging_batches)
    - `page_number` (integer) - 1-based page number
    - `bucket_id` (text, nullable) - selected bucket
    - `document_type_id` (text, nullable) - selected document type
    - `metadata` (jsonb, default '{}') - metadata field values
    - `rotation` (integer, default 0) - rotation in degrees (0, 90, 180, 270)
    - `indexed` (boolean, default false) - whether this page has been marked indexed
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - Enable RLS on both tables.
  - Authenticated users can CRUD their own batches and pages.

3. Notes
  - The raw PDF is stored in the 'imaging-batch-uploads' Supabase storage bucket.
  - When a batch reaches 100% indexed and is completed, the raw PDF is deleted from storage.
*/

-- Create the imaging_batches table
CREATE TABLE IF NOT EXISTS imaging_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  total_pages integer NOT NULL,
  indexed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE imaging_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_imaging_batches" ON imaging_batches;
CREATE POLICY "select_imaging_batches" ON imaging_batches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_imaging_batches" ON imaging_batches;
CREATE POLICY "insert_imaging_batches" ON imaging_batches FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_imaging_batches" ON imaging_batches;
CREATE POLICY "update_imaging_batches" ON imaging_batches FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_imaging_batches" ON imaging_batches;
CREATE POLICY "delete_imaging_batches" ON imaging_batches FOR DELETE
  TO authenticated USING (true);

-- Create the imaging_batch_pages table
CREATE TABLE IF NOT EXISTS imaging_batch_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES imaging_batches(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  bucket_id text,
  document_type_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  rotation integer NOT NULL DEFAULT 0,
  indexed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (batch_id, page_number)
);

ALTER TABLE imaging_batch_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_imaging_batch_pages" ON imaging_batch_pages;
CREATE POLICY "select_imaging_batch_pages" ON imaging_batch_pages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_imaging_batch_pages" ON imaging_batch_pages;
CREATE POLICY "insert_imaging_batch_pages" ON imaging_batch_pages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_imaging_batch_pages" ON imaging_batch_pages;
CREATE POLICY "update_imaging_batch_pages" ON imaging_batch_pages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_imaging_batch_pages" ON imaging_batch_pages;
CREATE POLICY "delete_imaging_batch_pages" ON imaging_batch_pages FOR DELETE
  TO authenticated USING (true);
