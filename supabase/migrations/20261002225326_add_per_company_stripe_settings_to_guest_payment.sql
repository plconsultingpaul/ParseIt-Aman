/*
# Per-company Stripe settings for Guest Payment

1. Modified Tables
- `guest_payment_companies`
  - `stripe_mode` (text, 'live' | 'test', default 'test'): which Stripe mode this company's payments use.
  - `stripe_publishable_key` (text, default ''): company's Live publishable key.
  - `stripe_test_publishable_key` (text, default ''): company's Test publishable key.

2. New Tables
- `guest_payment_company_stripe_secrets` (one row per company)
  - `company_id` (uuid, primary key, references guest_payment_companies, cascade delete)
  - `live_secret_key`, `test_secret_key` (text): Stripe secret keys
  - `live_webhook_secret`, `test_webhook_secret` (text): Stripe webhook signing secrets
  - `updated_at` (timestamptz)

3. Security
- RLS enabled on `guest_payment_company_stripe_secrets` with NO policies and all
  privileges revoked from anon/authenticated. Only server-side code (service role)
  can read or write secrets; admins manage them through an edge function that
  never returns the raw values.

4. Notes
1. Global Stripe mode/key columns on `guest_payment_config` are left in place (no data loss) but are no longer used.
2. Companies without Stripe secrets for their selected mode cannot take payments.
*/

ALTER TABLE guest_payment_companies ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'test';
ALTER TABLE guest_payment_companies ADD COLUMN IF NOT EXISTS stripe_publishable_key text NOT NULL DEFAULT '';
ALTER TABLE guest_payment_companies ADD COLUMN IF NOT EXISTS stripe_test_publishable_key text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_payment_companies_stripe_mode_check'
  ) THEN
    ALTER TABLE guest_payment_companies
      ADD CONSTRAINT guest_payment_companies_stripe_mode_check CHECK (stripe_mode IN ('live', 'test'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS guest_payment_company_stripe_secrets (
  company_id uuid PRIMARY KEY REFERENCES guest_payment_companies(id) ON DELETE CASCADE,
  live_secret_key text NOT NULL DEFAULT '',
  test_secret_key text NOT NULL DEFAULT '',
  live_webhook_secret text NOT NULL DEFAULT '',
  test_webhook_secret text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE guest_payment_company_stripe_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON guest_payment_company_stripe_secrets FROM anon, authenticated;
