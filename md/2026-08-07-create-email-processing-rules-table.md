# 2026-08-07 — Create `email_processing_rules` table

This is the full SQL to recreate the `email_processing_rules` table on another
Parse-It instance that is missing it. It matches the current production
schema (columns, defaults, constraints, indexes, RLS, and policies).

## Prerequisites
The referenced parent tables must already exist in the target database:
- `extraction_types`
- `transformation_types`
- `workflows_v2`
- an `is_admin()` function (used by the admin policies)

## Script

```sql
/*
# Create email_processing_rules

1. New Tables
   - `email_processing_rules`
     - `id` uuid, primary key, defaults to `gen_random_uuid()`
     - `rule_name` text, not null
     - `sender_pattern` text, not null, default ''
     - `subject_pattern` text, not null, default ''
     - `extraction_type_id` uuid, FK -> extraction_types(id) ON DELETE CASCADE
     - `transformation_type_id` uuid, FK -> transformation_types(id) ON DELETE CASCADE
     - `workflow_v2_id` uuid, FK -> workflows_v2(id) ON DELETE SET NULL
     - `processing_mode` text, not null, default 'extraction'
       (allowed: 'extraction', 'transformation', 'workflow_v2')
     - `is_enabled` boolean, not null, default true
     - `priority` integer, not null, default 1
     - `created_at` timestamptz, default now()
     - `updated_at` timestamptz, default now()

2. Indexes
   - Primary key on `id`
   - Btree indexes on `extraction_type_id`, `transformation_type_id`, `workflow_v2_id`

3. Security
   - RLS enabled
   - Authenticated users may SELECT
   - Only admins (`is_admin()`) may INSERT, UPDATE, DELETE
*/

CREATE TABLE IF NOT EXISTS email_processing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  sender_pattern text NOT NULL DEFAULT '',
  subject_pattern text NOT NULL DEFAULT '',
  extraction_type_id uuid REFERENCES extraction_types(id) ON DELETE CASCADE,
  transformation_type_id uuid REFERENCES transformation_types(id) ON DELETE CASCADE,
  workflow_v2_id uuid REFERENCES workflows_v2(id) ON DELETE SET NULL,
  processing_mode text NOT NULL DEFAULT 'extraction'
    CHECK (processing_mode IN ('extraction', 'transformation', 'workflow_v2')),
  is_enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_processing_rules_extraction_type_id
  ON email_processing_rules (extraction_type_id);

CREATE INDEX IF NOT EXISTS idx_email_processing_rules_transformation_type_id_fk
  ON email_processing_rules (transformation_type_id);

CREATE INDEX IF NOT EXISTS idx_email_processing_rules_workflow_v2_id
  ON email_processing_rules (workflow_v2_id);

ALTER TABLE email_processing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can select email_processing_rules" ON email_processing_rules;
CREATE POLICY "Authenticated can select email_processing_rules"
  ON email_processing_rules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert email_processing_rules" ON email_processing_rules;
CREATE POLICY "Admins can insert email_processing_rules"
  ON email_processing_rules FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update email_processing_rules" ON email_processing_rules;
CREATE POLICY "Admins can update email_processing_rules"
  ON email_processing_rules FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete email_processing_rules" ON email_processing_rules;
CREATE POLICY "Admins can delete email_processing_rules"
  ON email_processing_rules FOR DELETE
  TO authenticated
  USING (is_admin());
```

## How to run
Apply this script through the Parse-It Supabase project's SQL editor (or the
migration tool) on the instance that is missing the table. The script is
idempotent — it is safe to re-run.
