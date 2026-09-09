/*
# Add 'paused_at_inbox' to workflow_v2_execution_logs status CHECK constraint

1. Modified Tables
   - `workflow_v2_execution_logs`
     - Updated `status` CHECK constraint to include 'paused_at_inbox' as a valid value.

2. Reason
   - When a workflow reaches an Inbox Review step, the edge function updates the
     execution log status to 'paused_at_inbox' to indicate the workflow is waiting
     for human approval. The existing CHECK constraint only allows 'pending',
     'running', 'completed', 'failed', causing the update to silently fail and
     leaving the status stuck at 'running'.

3. Important Notes
   - No data loss; only widens the set of allowed status values.
   - Existing rows are unaffected.
   - The edge function (json-workflow-processor-v2) already writes this status
     correctly; only the database constraint was rejecting it.
*/

ALTER TABLE workflow_v2_execution_logs
  DROP CONSTRAINT IF EXISTS workflow_v2_execution_logs_status_check;

ALTER TABLE workflow_v2_execution_logs
  ADD CONSTRAINT workflow_v2_execution_logs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'paused_at_inbox'::text]));
