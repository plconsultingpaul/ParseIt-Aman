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
