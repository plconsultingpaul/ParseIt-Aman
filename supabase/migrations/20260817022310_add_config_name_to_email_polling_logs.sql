/*
# Add config_name to email_polling_logs

1. Modified Tables
   - `email_polling_logs`
     - Added `config_name` (text, nullable) — stores the human-readable account name
       (e.g. "BOL Email", "POD Email") so each polling log row can be traced back
       to the specific email monitoring configuration that produced it.

2. Important Notes
   - Existing rows will have NULL for config_name, which is expected.
   - No RLS changes needed — table already has policies in place.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_polling_logs' AND column_name = 'config_name'
  ) THEN
    ALTER TABLE email_polling_logs ADD COLUMN config_name text;
  END IF;
END $$;
