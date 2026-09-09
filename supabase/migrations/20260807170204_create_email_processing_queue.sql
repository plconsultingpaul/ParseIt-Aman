/*
# Email Processing Queue — Step 1

Creates the persistence layer for the new capture-then-process email pipeline.
Nothing observable changes for existing users until Step 2 starts writing to
this table.

1. New Tables
   - `email_processing_queue`
     - One row per PDF attachment captured from an incoming email.
     - `id` uuid primary key
     - `source_message_id` text — provider message id (Graph / Gmail)
     - `provider` text — 'office365' | 'gmail'
     - `email_subject` text
     - `email_from` text
     - `email_received_date` timestamptz
     - `matching_rule_id` uuid — FK email_processing_rules(id) ON DELETE SET NULL
     - `processing_mode` text — 'extraction' | 'workflow_v2' | 'transformation'
     - `extraction_type_id` uuid — nullable, FK ON DELETE SET NULL
     - `transformation_type_id` uuid — nullable, FK ON DELETE SET NULL
     - `workflow_v2_id` uuid — nullable, FK ON DELETE SET NULL
     - `original_filename` text
     - `storage_path` text — path in the email-processing-pdfs bucket
     - `page_count` int
     - `status` text — 'pending' | 'processing' | 'processed' | 'failed'
     - `attempts` int
     - `error_message` text
     - `result` jsonb
     - `worker_locked_at` timestamptz — set by the claim RPC
     - `processed_at` timestamptz
     - `created_at`, `updated_at` timestamptz

2. New Storage Bucket
   - `email-processing-pdfs` (private) for the raw captured PDFs.
   - Access is via signed URLs from the app / service role from the worker.

3. New Functions
   - `claim_next_email_processing_queue_item()` — SECURITY DEFINER, service_role
     only. Atomically claims the oldest pending row using FOR UPDATE SKIP LOCKED,
     flips status to 'processing', bumps attempts, sets worker_locked_at.
   - `reset_stale_email_processing_queue_items(minutes int default 15)` —
     SECURITY DEFINER, service_role only. Returns any 'processing' row whose
     worker_locked_at is older than N minutes back to 'pending'.
   - `set_updated_at_timestamp()` trigger helper (created idempotently).

4. Security
   - RLS enabled on `email_processing_queue`.
   - Four policies (select/insert/update/delete) scoped `TO authenticated`
     matching the existing `inbox_items` shared-queue precedent — any signed-in
     user can view and manage the shared operational queue.
   - Storage bucket has authenticated read/insert/update/delete policies for
     the `email-processing-pdfs` bucket only.
   - RPC EXECUTE is granted to `service_role` only (worker calls it with the
     service key). REVOKE from anon/authenticated.

5. Important Notes
   1. This migration is idempotent — safe to re-run.
   2. No data from other tables is modified or deleted.
   3. The email-monitor function is NOT changed here (that is Step 2). Rows
      will start being written in Step 2, and the worker consuming them is
      Step 3.
*/

-- 1. updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Table
CREATE TABLE IF NOT EXISTS email_processing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id text,
  provider text,
  email_subject text,
  email_from text,
  email_received_date timestamptz,
  matching_rule_id uuid REFERENCES email_processing_rules(id) ON DELETE SET NULL,
  processing_mode text NOT NULL CHECK (processing_mode IN ('extraction','workflow_v2','transformation')),
  extraction_type_id uuid,
  transformation_type_id uuid,
  workflow_v2_id uuid,
  original_filename text,
  storage_path text NOT NULL,
  page_count int,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  attempts int NOT NULL DEFAULT 0,
  error_message text,
  result jsonb,
  worker_locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Optional FKs added conditionally so migration works even if referenced tables
-- have different names in this project. Guard each so it's idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='extraction_types')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name='email_processing_queue_extraction_type_id_fkey'
     ) THEN
    ALTER TABLE email_processing_queue
      ADD CONSTRAINT email_processing_queue_extraction_type_id_fkey
      FOREIGN KEY (extraction_type_id) REFERENCES extraction_types(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='transformation_types')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name='email_processing_queue_transformation_type_id_fkey'
     ) THEN
    ALTER TABLE email_processing_queue
      ADD CONSTRAINT email_processing_queue_transformation_type_id_fkey
      FOREIGN KEY (transformation_type_id) REFERENCES transformation_types(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workflow_v2_configs')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name='email_processing_queue_workflow_v2_id_fkey'
     ) THEN
    ALTER TABLE email_processing_queue
      ADD CONSTRAINT email_processing_queue_workflow_v2_id_fkey
      FOREIGN KEY (workflow_v2_id) REFERENCES workflow_v2_configs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_processing_queue_status
  ON email_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_processing_queue_created_at
  ON email_processing_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_processing_queue_source_message
  ON email_processing_queue(source_message_id);
CREATE INDEX IF NOT EXISTS idx_email_processing_queue_status_created
  ON email_processing_queue(status, created_at);

DROP TRIGGER IF EXISTS trg_email_processing_queue_updated_at ON email_processing_queue;
CREATE TRIGGER trg_email_processing_queue_updated_at
  BEFORE UPDATE ON email_processing_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- 3. RLS
ALTER TABLE email_processing_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_email_processing_queue" ON email_processing_queue;
CREATE POLICY "select_email_processing_queue" ON email_processing_queue
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_email_processing_queue" ON email_processing_queue;
CREATE POLICY "insert_email_processing_queue" ON email_processing_queue
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_email_processing_queue" ON email_processing_queue;
CREATE POLICY "update_email_processing_queue" ON email_processing_queue
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_email_processing_queue" ON email_processing_queue;
CREATE POLICY "delete_email_processing_queue" ON email_processing_queue
  FOR DELETE TO authenticated USING (true);

-- 4. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-processing-pdfs', 'email-processing-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "email_pdfs_authenticated_select" ON storage.objects;
CREATE POLICY "email_pdfs_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'email-processing-pdfs');

DROP POLICY IF EXISTS "email_pdfs_authenticated_insert" ON storage.objects;
CREATE POLICY "email_pdfs_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-processing-pdfs');

DROP POLICY IF EXISTS "email_pdfs_authenticated_update" ON storage.objects;
CREATE POLICY "email_pdfs_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'email-processing-pdfs')
  WITH CHECK (bucket_id = 'email-processing-pdfs');

DROP POLICY IF EXISTS "email_pdfs_authenticated_delete" ON storage.objects;
CREATE POLICY "email_pdfs_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'email-processing-pdfs');

-- 5. Atomic-claim RPC (service_role only)
CREATE OR REPLACE FUNCTION claim_next_email_processing_queue_item()
RETURNS SETOF email_processing_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id uuid;
BEGIN
  SELECT id INTO claimed_id
  FROM email_processing_queue
  WHERE status = 'pending'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE email_processing_queue
  SET status = 'processing',
      worker_locked_at = now(),
      attempts = attempts + 1
  WHERE id = claimed_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION claim_next_email_processing_queue_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_next_email_processing_queue_item() FROM anon;
REVOKE ALL ON FUNCTION claim_next_email_processing_queue_item() FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_next_email_processing_queue_item() TO service_role;

-- 6. Stale-reset RPC (service_role only)
CREATE OR REPLACE FUNCTION reset_stale_email_processing_queue_items(stale_minutes int DEFAULT 15)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_count int;
BEGIN
  WITH updated AS (
    UPDATE email_processing_queue
    SET status = 'pending',
        worker_locked_at = NULL
    WHERE status = 'processing'
      AND worker_locked_at IS NOT NULL
      AND worker_locked_at < now() - make_interval(mins => stale_minutes)
    RETURNING id
  )
  SELECT count(*) INTO reset_count FROM updated;

  RETURN reset_count;
END;
$$;

REVOKE ALL ON FUNCTION reset_stale_email_processing_queue_items(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION reset_stale_email_processing_queue_items(int) FROM anon;
REVOKE ALL ON FUNCTION reset_stale_email_processing_queue_items(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION reset_stale_email_processing_queue_items(int) TO service_role;
