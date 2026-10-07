/*
  # Add timezone to company_branding

  Adds a global IANA timezone setting to the company_branding table so datetime
  values sent from Execute Flow API Endpoint steps can be anchored to a single
  known timezone rather than the browser's local time.

  ## Change
    - `timezone` (text, default 'UTC') on `company_branding`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_branding' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE company_branding ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
  END IF;
END $$;
