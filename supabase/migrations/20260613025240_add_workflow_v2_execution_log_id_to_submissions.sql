-- Add workflow_v2_execution_log_id column for V2 workflow tracking
ALTER TABLE order_entry_submissions
ADD COLUMN IF NOT EXISTS workflow_v2_execution_log_id uuid REFERENCES workflow_v2_execution_logs(id);