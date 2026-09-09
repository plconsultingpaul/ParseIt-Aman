/*
# Add page group progress tracking to email processing queue

1. Modified Tables
   - `email_processing_queue`
     - `page_group_assignments` (jsonb, nullable) — stores the pre-computed
       page-to-group assignment list so the worker can resume across invocations.
     - `page_group_next_index` (int, default 0) — the index of the next
       assignment to process. Incremented after each successful chunk.
     - `page_group_session_id` (text, nullable) — session identifier for
       grouping extraction logs across resumable invocations.
     - `page_group_results` (jsonb, nullable) — accumulated per-page results
       from all invocations so far.

2. Why
   The email-processing-worker runs as an Edge Function with a wall-clock
   timeout. Multi-page PDFs with page group detection require multiple
   sequential Gemini + pdf-transformer + workflow-processor calls, which can
   exceed the timeout. These columns let the worker process ONE assignment
   per invocation, save progress, then re-queue itself for the next one —
   ensuring the full document completes across multiple short invocations
   instead of one long one that gets killed.

3. Security
   No new policies needed — existing RLS policies on email_processing_queue
   already cover all CRUD for authenticated users.

4. Important Notes
   1. All columns are nullable/defaulted so existing rows are unaffected.
   2. No data is modified or deleted.
   3. The worker code change (separate deploy) reads/writes these columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_processing_queue'
      AND column_name = 'page_group_assignments'
  ) THEN
    ALTER TABLE email_processing_queue
      ADD COLUMN page_group_assignments jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_processing_queue'
      AND column_name = 'page_group_next_index'
  ) THEN
    ALTER TABLE email_processing_queue
      ADD COLUMN page_group_next_index int NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_processing_queue'
      AND column_name = 'page_group_session_id'
  ) THEN
    ALTER TABLE email_processing_queue
      ADD COLUMN page_group_session_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_processing_queue'
      AND column_name = 'page_group_results'
  ) THEN
    ALTER TABLE email_processing_queue
      ADD COLUMN page_group_results jsonb;
  END IF;
END $$;
