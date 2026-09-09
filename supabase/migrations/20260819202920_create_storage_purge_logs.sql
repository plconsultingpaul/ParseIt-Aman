/*
# Create storage_purge_logs table

Adds an audit trail for Supabase Storage bucket purges initiated from the
Storage Management panel. Every purge run records who did it, which buckets
were affected, the cutoff date, how many files were removed and how many
bytes were freed.

1. New Tables
   - `storage_purge_logs`
     - `id` (uuid, primary key)
     - `performed_by` (uuid, references auth.users)
     - `buckets` (text[]) — buckets targeted
     - `cutoff_date` (timestamptz) — files older than this were removed
     - `files_removed` (integer) — total across all buckets
     - `bytes_freed` (bigint) — total across all buckets
     - `details` (jsonb) — per-bucket breakdown
     - `created_at` (timestamptz)

2. Security
   - RLS enabled.
   - Authenticated users can select and insert their own rows.
*/

CREATE TABLE IF NOT EXISTS storage_purge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buckets text[] NOT NULL DEFAULT '{}',
  cutoff_date timestamptz NOT NULL,
  files_removed integer NOT NULL DEFAULT 0,
  bytes_freed bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_purge_logs_created_at_idx
  ON storage_purge_logs (created_at DESC);

ALTER TABLE storage_purge_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_storage_purge_logs" ON storage_purge_logs;
CREATE POLICY "select_own_storage_purge_logs" ON storage_purge_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = performed_by);

DROP POLICY IF EXISTS "insert_own_storage_purge_logs" ON storage_purge_logs;
CREATE POLICY "insert_own_storage_purge_logs" ON storage_purge_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = performed_by);
