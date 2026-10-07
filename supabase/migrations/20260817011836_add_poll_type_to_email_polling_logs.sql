/*
# Add poll_type column to email_polling_logs

1. Modified Tables
   - `email_polling_logs`
     - Added `poll_type` (text, not null, default 'email_monitoring')
       - Distinguishes between regular email monitoring polls and imaging email polls
       - Allowed values: 'email_monitoring', 'imaging_email'

2. Important Notes
   - All existing rows default to 'email_monitoring'
   - The imaging-email-monitor edge function will be updated to write 'imaging_email'
   - Added a CHECK constraint to enforce valid poll_type values
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_polling_logs' AND column_name = 'poll_type'
  ) THEN
    ALTER TABLE email_polling_logs
      ADD COLUMN poll_type text NOT NULL DEFAULT 'email_monitoring';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'email_polling_logs_poll_type_check'
      AND table_name = 'email_polling_logs'
  ) THEN
    ALTER TABLE email_polling_logs
      ADD CONSTRAINT email_polling_logs_poll_type_check
      CHECK (poll_type IN ('email_monitoring', 'imaging_email'));
  END IF;
END $$;