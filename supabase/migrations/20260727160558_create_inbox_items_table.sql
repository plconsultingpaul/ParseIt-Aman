/*
# Create inbox_items table for Workflow V2 Inbox Step

## Overview
Creates the `inbox_items` table that stores paused workflow state when a workflow
reaches an "inbox" step. Each row represents a workflow execution that has been
paused mid-flight and is waiting for a human to review, edit, and accept or reject
the extracted data before the workflow continues.

## 1. New Tables
- `inbox_items`
  - `id` (uuid, primary key) — unique identifier for the inbox item
  - `workflow_id` (uuid, not null) — references the workflow_v2 that was executing
  - `workflow_execution_log_id` (uuid) — references the paused execution log
  - `extraction_log_id` (uuid) — references the extraction log entry
  - `extraction_type_id` (uuid) — references the extraction type for field mappings
  - `inbox_node_id` (text, not null) — the ID of the inbox node that paused execution
  - `status` (text, not null) — 'pending', 'accepted', or 'rejected'
  - `context_data` (jsonb, not null) — full snapshot of workflow contextData at pause time
  - `extracted_data` (jsonb, not null) — the extracted data available for review/edit
  - `original_extracted_data` (jsonb) — original data before user edits (for reset)
  - `pdf_storage_path` (text) — path to the PDF in Supabase Storage
  - `pdf_filename` (text) — current filename of the PDF
  - `original_pdf_filename` (text) — original filename before any renaming
  - `trigger_source` (text) — 'email_monitoring' or null (manual upload)
  - `sender_email` (text) — email sender if triggered by email monitor
  - `extraction_type_name` (text) — human-readable extraction type name
  - `format_type` (text) — 'JSON', 'XML', or 'CSV'
  - `resolved_by` (uuid) — user who accepted/rejected
  - `resolved_at` (timestamptz) — when the item was resolved
  - `resolution_notes` (text) — optional notes from the reviewer
  - `edited_data` (jsonb) — the data as modified by the reviewer
  - `created_at` (timestamptz) — when the inbox item was created
  - `updated_at` (timestamptz) — last update timestamp

## 2. Security
- RLS enabled on `inbox_items`
- Authenticated users can SELECT all inbox items (shared review queue)
- Authenticated users can UPDATE inbox items (to accept/reject)
- INSERT is restricted to authenticated (edge functions use service role which bypasses RLS)
- DELETE restricted to authenticated users (for cleanup)

## 3. Indexes
- Index on `status` for filtering pending items
- Index on `extraction_type_id` for filtering by type
- Index on `created_at` for ordering
- Index on `workflow_execution_log_id` for lookups

## 4. Important Notes
- The `context_data` column stores the FULL workflow context at pause time, which
  includes all extracted fields, workflow-only fields, filenames, timestamps, etc.
  This allows the resume function to pick up exactly where it left off.
- The `extracted_data` column stores just the extracted data portion for display
  in the review UI (similar to what AiReviewModal shows).
- Foreign keys to workflows_v2 and extraction_types use ON DELETE SET NULL to avoid
  cascading deletes of historical inbox items.
*/

CREATE TABLE IF NOT EXISTS inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows_v2(id) ON DELETE CASCADE,
  workflow_execution_log_id UUID REFERENCES workflow_v2_execution_logs(id) ON DELETE SET NULL,
  extraction_log_id UUID REFERENCES extraction_logs(id) ON DELETE SET NULL,
  extraction_type_id UUID REFERENCES extraction_types(id) ON DELETE SET NULL,
  inbox_node_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_extracted_data JSONB,
  pdf_storage_path TEXT,
  pdf_filename TEXT,
  original_pdf_filename TEXT,
  trigger_source TEXT,
  sender_email TEXT,
  extraction_type_name TEXT,
  format_type TEXT DEFAULT 'JSON',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  edited_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated users share the inbox queue
DROP POLICY IF EXISTS "select_inbox_items" ON inbox_items;
CREATE POLICY "select_inbox_items" ON inbox_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inbox_items" ON inbox_items;
CREATE POLICY "insert_inbox_items" ON inbox_items FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inbox_items" ON inbox_items;
CREATE POLICY "update_inbox_items" ON inbox_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_inbox_items" ON inbox_items;
CREATE POLICY "delete_inbox_items" ON inbox_items FOR DELETE
  TO authenticated USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inbox_items_status ON inbox_items(status);
CREATE INDEX IF NOT EXISTS idx_inbox_items_extraction_type_id ON inbox_items(extraction_type_id);
CREATE INDEX IF NOT EXISTS idx_inbox_items_created_at ON inbox_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_items_workflow_execution_log_id ON inbox_items(workflow_execution_log_id);
