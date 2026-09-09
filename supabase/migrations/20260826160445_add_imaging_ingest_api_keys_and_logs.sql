/*
  # Imaging Ingest API keys and audit log

  ## Summary
  Adds a bearer-token API surface so external software can post PDFs directly
  into Imaging with a known Document Type and Bill Number. Each partner receives
  a token; only the SHA-256 hash of the token is stored. Every ingest request
  is audited.

  ## Tables
  - `imaging_api_keys`
      - `id` uuid PK
      - `name` text (partner label)
      - `key_hash` text (SHA-256 hex of the raw token — NEVER the raw token)
      - `prefix` text (first 8 chars of the raw token, for display only)
      - `is_active` boolean, default true
      - `last_used_at` timestamptz nullable
      - `created_by` uuid nullable
      - `created_at`, `updated_at` timestamptz
  - `imaging_ingest_logs`
      - `id` uuid PK
      - `api_key_id` uuid nullable (FK to imaging_api_keys)
      - `partner_name` text nullable
      - `original_filename` text nullable
      - `bill_number` text nullable
      - `document_type_name` text nullable
      - `bucket_id` uuid nullable
      - `imaging_document_id` uuid nullable
      - `status` text check (in success/error/unauthorized)
      - `error_message` text nullable
      - `created_at` timestamptz default now()

  ## Security
  RLS enabled. Authenticated users may read/write both tables (admin gating in
  the UI). Service-role continues to bypass RLS for the edge function.
*/

CREATE TABLE IF NOT EXISTS imaging_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imaging_api_keys_active ON imaging_api_keys (is_active);
CREATE INDEX IF NOT EXISTS idx_imaging_api_keys_hash ON imaging_api_keys (key_hash);

ALTER TABLE imaging_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_imaging_api_keys" ON imaging_api_keys;
CREATE POLICY "select_imaging_api_keys" ON imaging_api_keys FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_imaging_api_keys" ON imaging_api_keys;
CREATE POLICY "insert_imaging_api_keys" ON imaging_api_keys FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_imaging_api_keys" ON imaging_api_keys;
CREATE POLICY "update_imaging_api_keys" ON imaging_api_keys FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_imaging_api_keys" ON imaging_api_keys;
CREATE POLICY "delete_imaging_api_keys" ON imaging_api_keys FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS imaging_ingest_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES imaging_api_keys(id) ON DELETE SET NULL,
  partner_name text,
  original_filename text,
  bill_number text,
  document_type_name text,
  bucket_id uuid,
  imaging_document_id uuid,
  status text NOT NULL CHECK (status IN ('success','error','unauthorized')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imaging_ingest_logs_created ON imaging_ingest_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imaging_ingest_logs_api_key ON imaging_ingest_logs (api_key_id);
CREATE INDEX IF NOT EXISTS idx_imaging_ingest_logs_status ON imaging_ingest_logs (status);

ALTER TABLE imaging_ingest_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_imaging_ingest_logs" ON imaging_ingest_logs;
CREATE POLICY "select_imaging_ingest_logs" ON imaging_ingest_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_imaging_ingest_logs" ON imaging_ingest_logs;
CREATE POLICY "insert_imaging_ingest_logs" ON imaging_ingest_logs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_imaging_ingest_logs" ON imaging_ingest_logs;
CREATE POLICY "delete_imaging_ingest_logs" ON imaging_ingest_logs FOR DELETE
  TO authenticated USING (true);
