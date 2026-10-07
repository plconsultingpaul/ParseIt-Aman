/*
# Create email_sending_accounts table

Re-applies the Sending Accounts schema that was never applied to this database
(Settings > Email Monitoring > Sending Accounts showed "Could not find the table").

1. New Tables
  - `email_sending_accounts`: one or more sending email providers selectable on Workflow v2 Email steps
    - `id` uuid pk, `account_name` text unique, `provider` ('office365' | 'gmail'), `from_email`
    - Office 365: `tenant_id`, `client_id`, `client_secret`
    - Gmail: `gmail_client_id`, `gmail_client_secret`, `gmail_refresh_token`
    - `is_default` boolean, `created_at`, `updated_at`
2. Security
  - RLS enabled; four separate policies (select/insert/update/delete) for signed-in operators.
3. Notes
  1. Trigger keeps `updated_at` current.
  2. Idempotent and safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.email_sending_accounts (
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
  ON public.email_sending_accounts (account_name);

ALTER TABLE public.email_sending_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_sending_accounts_select_authenticated" ON public.email_sending_accounts;
CREATE POLICY "email_sending_accounts_select_authenticated"
  ON public.email_sending_accounts FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "email_sending_accounts_insert_authenticated" ON public.email_sending_accounts;
CREATE POLICY "email_sending_accounts_insert_authenticated"
  ON public.email_sending_accounts FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "email_sending_accounts_update_authenticated" ON public.email_sending_accounts;
CREATE POLICY "email_sending_accounts_update_authenticated"
  ON public.email_sending_accounts FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "email_sending_accounts_delete_authenticated" ON public.email_sending_accounts;
CREATE POLICY "email_sending_accounts_delete_authenticated"
  ON public.email_sending_accounts FOR DELETE TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_email_sending_accounts_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sending_accounts_updated_at
  ON public.email_sending_accounts;

CREATE TRIGGER trg_email_sending_accounts_updated_at
  BEFORE UPDATE ON public.email_sending_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_email_sending_accounts_updated_at();

NOTIFY pgrst, 'reload schema';