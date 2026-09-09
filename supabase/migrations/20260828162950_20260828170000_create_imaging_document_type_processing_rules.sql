/*
# Create imaging document type processing rules

1. New Tables
   - `imaging_document_type_processing_rules`
     - `id` (uuid, primary key)
     - `rule_name` (text)
     - `document_type_id` (uuid, fk -> imaging_document_types)
     - `imaging_bucket_id` (uuid, nullable fk -> imaging_buckets; NULL means "any bucket")
     - `workflow_v2_id` (uuid, nullable fk -> workflows_v2)
     - `trigger_sources` (text[], default {'manual','api'})
     - `is_enabled` (boolean, default true)
     - `priority` (integer, default 1)
     - `created_at`, `updated_at` (timestamptz)

2. Security
   - Enable RLS.
   - Admin-only SELECT/INSERT/UPDATE/DELETE (matches imaging_email_processing_rules).

3. Notes
   Rules are evaluated when an imaging document is indexed via manual UI upload
   ("manual") or via the imaging-ingest API ("api"). Matching rules fire the
   associated Workflow V2 (workflow_type = 'imaging') in priority order. All
   matching rules run; the first-match-wins behavior is intentionally NOT used.
*/

CREATE TABLE IF NOT EXISTS imaging_document_type_processing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL DEFAULT '',
  document_type_id uuid NOT NULL REFERENCES imaging_document_types(id) ON DELETE CASCADE,
  imaging_bucket_id uuid REFERENCES imaging_buckets(id) ON DELETE SET NULL,
  workflow_v2_id uuid REFERENCES workflows_v2(id) ON DELETE SET NULL,
  trigger_sources text[] NOT NULL DEFAULT ARRAY['manual','api']::text[],
  is_enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imaging_doc_type_rules_doc_type
  ON imaging_document_type_processing_rules(document_type_id);
CREATE INDEX IF NOT EXISTS idx_imaging_doc_type_rules_bucket
  ON imaging_document_type_processing_rules(imaging_bucket_id);
CREATE INDEX IF NOT EXISTS idx_imaging_doc_type_rules_priority
  ON imaging_document_type_processing_rules(priority);

ALTER TABLE imaging_document_type_processing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select imaging doc type rules" ON imaging_document_type_processing_rules;
CREATE POLICY "Admins can select imaging doc type rules"
  ON imaging_document_type_processing_rules FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert imaging doc type rules" ON imaging_document_type_processing_rules;
CREATE POLICY "Admins can insert imaging doc type rules"
  ON imaging_document_type_processing_rules FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update imaging doc type rules" ON imaging_document_type_processing_rules;
CREATE POLICY "Admins can update imaging doc type rules"
  ON imaging_document_type_processing_rules FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete imaging doc type rules" ON imaging_document_type_processing_rules;
CREATE POLICY "Admins can delete imaging doc type rules"
  ON imaging_document_type_processing_rules FOR DELETE
  TO authenticated
  USING (is_admin());
