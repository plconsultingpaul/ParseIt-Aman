/*
# Add 'paused' to workflow_v2_step_logs status CHECK constraint

1. Modified Tables
   - `workflow_v2_step_logs`
     - Updated `status` CHECK constraint to include 'paused' as a valid value.

2. Reason
   - The Inbox Review workflow step writes a step log with status 'paused' when it
     sends data to the inbox for human review. The existing CHECK constraint only
     allows 'running', 'completed', 'failed', 'skipped', causing a 400 error and
     preventing the step log from being recorded.

3. Important Notes
   - No data loss; only widens the set of allowed values.
   - Existing rows are unaffected.
*/

ALTER TABLE workflow_v2_step_logs
  DROP CONSTRAINT IF EXISTS workflow_v2_step_logs_status_check;

ALTER TABLE workflow_v2_step_logs
  ADD CONSTRAINT workflow_v2_step_logs_status_check
  CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'skipped'::text, 'paused'::text]));
