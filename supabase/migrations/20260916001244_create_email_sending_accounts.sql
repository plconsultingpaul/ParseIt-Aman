/*
  # Add multi-sender email accounts for Workflow v2 email step

  Adds a dedicated table to store one or more "sending" email provider
  configurations that can be selected on the Workflow v2 Email step.
  Existing behavior (singleton `email_monitoring_config`) remains intact
  as a fallback when no account is chosen.

  1. New Tables
    - `email_sending_accounts`
      - `id` (uuid, pk)
      - `account_name` (text, unique, not null) - friendly name shown in dropdowns
      - `provider` (text, not null) - 'office365' or 'gmail'
      - `from_email` (text, not null) - address the email is sent from
      - `tenant_id` (text) - Office 365 tenant
      - `client_id` (text) - Office 365 client id
      - `client_secret` (text) - Office 365 client secret
      - `gmail_client_id` (text)
      - `gmail_client_secret` (text)
      - `gmail_refresh_token` (text)
      - `is_default` (boolean, default false)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - Enable RLS.
    - Four authenticated policies (select/insert/update/delete) so signed-in
      operators can manage sending accounts.
*/

CREATE TABLE IF NOT EXISTS email_sending_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  provider text NOT NULL DEFAULT 'office365',
  from_email text NOT NULL DEFAULT '',
  tenant_id text DEFAULT '',
  client_id text DEFAULT '',
  client_secret text DEFAULT '',
  gmail_client_id text DEFAULT '',
  gmail_client_secret text DEFAULT '',
  gmail_refresh_token text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_sending_accounts_provider_check
    CHECK (provider IN ('office365', 'gmail'))
);

CREATE UNIQUE INDEX IF NOT EXISTS email_sending_accounts_account_name_key
  ON email_sending_accounts (account_name);

ALTER TABLE email_sending_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_sending_accounts_select_authenticated"
  ON email_sending_accounts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "email_sending_accounts_insert_authenticated"
  ON email_sending_accounts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "email_sending_accounts_update_authenticated"
  ON email_sending_accounts FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "email_sending_accounts_delete_authenticated"
  ON email_sending_accounts FOR DELETE TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION set_email_sending_accounts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sending_accounts_updated_at
  ON email_sending_accounts;

CREATE TRIGGER trg_email_sending_accounts_updated_at
  BEFORE UPDATE ON email_sending_accounts
  FOR EACH ROW EXECUTE FUNCTION set_email_sending_accounts_updated_at();
