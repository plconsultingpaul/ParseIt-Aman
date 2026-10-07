/*
# Guest Payment - Multi-company support

Splits guest payment configuration so that the guest-facing page (branding,
search boxes, Stripe) stays global, while the per-company details (Search API
#1/#2, Success API, Grid 1 / Grid 2, receipt email) live under company records
selected at runtime by matching a prefix against a designated search field.

1. New Tables
  - `guest_payment_companies`
    Per-company settings.
      - `id` (uuid, pk)
      - `name` (text, e.g. "Company 1")
      - `enabled` (bool)
      - `sort_order` (int)
      - `search_api_1`, `search_api_2`, `success_api_call` (jsonb)
      - `grid_1_columns`, `grid_2_columns` (jsonb)
      - `receipt_subject_template`, `receipt_body_template`, `receipt_from_email`, `receipt_to_email` (text)
      - `receipt_sending_account_id` (uuid, fk email_sending_accounts)
      - `created_at`, `updated_at` (timestamptz)
  - `guest_payment_routing_rules`
    Prefix (extensible) match rules mapping a search field value to a company.
      - `id` (uuid, pk)
      - `company_id` (uuid, fk guest_payment_companies ON DELETE CASCADE)
      - `match_type` (text: `prefix` for now)
      - `match_value` (text, e.g. "XT")
      - `case_sensitive` (bool, default false)
      - `sort_order` (int)
      - `created_at`, `updated_at` (timestamptz)

2. Modified Tables
  - `guest_payment_config`
    Adds `routing_search_box_key` (text) — key of the search box whose value
    is inspected to pick a company. Adds `default_company_id` (uuid, nullable)
    used when no routing rule matches.
  - `guest_payment_transactions`
    Adds `company_id` (uuid, nullable) — company that handled this
    transaction. Kept nullable so existing rows continue to work.

3. Data Migration
  - For each existing `guest_payment_config` row, inserts a company named
    "Default" seeded from the row's current per-company fields (only if no
    company exists yet), and sets `default_company_id` on the config row.

4. Security
  - RLS enabled on both new tables.
  - Admin-only management (authenticated select/insert/update/delete). The
    public guest page reads companies through the service-role edge functions,
    not directly, so no anon policies are needed.
*/

CREATE TABLE IF NOT EXISTS guest_payment_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'New Company',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  search_api_1 jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_api_2 jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_api_call jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid_1_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  grid_2_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  receipt_subject_template text NOT NULL DEFAULT 'Your payment receipt',
  receipt_body_template text NOT NULL DEFAULT 'Thank you for your payment.',
  receipt_from_email text NOT NULL DEFAULT '',
  receipt_to_email text NOT NULL DEFAULT '{guest_email}',
  receipt_sending_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE guest_payment_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gp_companies_select" ON guest_payment_companies;
CREATE POLICY "gp_companies_select" ON guest_payment_companies FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "gp_companies_insert" ON guest_payment_companies;
CREATE POLICY "gp_companies_insert" ON guest_payment_companies FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "gp_companies_update" ON guest_payment_companies;
CREATE POLICY "gp_companies_update" ON guest_payment_companies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gp_companies_delete" ON guest_payment_companies;
CREATE POLICY "gp_companies_delete" ON guest_payment_companies FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS guest_payment_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES guest_payment_companies(id) ON DELETE CASCADE,
  match_type text NOT NULL DEFAULT 'prefix',
  match_value text NOT NULL DEFAULT '',
  case_sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_routing_rules_company ON guest_payment_routing_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_gp_routing_rules_sort ON guest_payment_routing_rules(sort_order);

ALTER TABLE guest_payment_routing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gp_routing_select" ON guest_payment_routing_rules;
CREATE POLICY "gp_routing_select" ON guest_payment_routing_rules FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "gp_routing_insert" ON guest_payment_routing_rules;
CREATE POLICY "gp_routing_insert" ON guest_payment_routing_rules FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "gp_routing_update" ON guest_payment_routing_rules;
CREATE POLICY "gp_routing_update" ON guest_payment_routing_rules FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gp_routing_delete" ON guest_payment_routing_rules;
CREATE POLICY "gp_routing_delete" ON guest_payment_routing_rules FOR DELETE
  TO authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guest_payment_config' AND column_name = 'routing_search_box_key'
  ) THEN
    ALTER TABLE guest_payment_config ADD COLUMN routing_search_box_key text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guest_payment_config' AND column_name = 'default_company_id'
  ) THEN
    ALTER TABLE guest_payment_config ADD COLUMN default_company_id uuid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guest_payment_transactions' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE guest_payment_transactions ADD COLUMN company_id uuid;
  END IF;
END $$;

DO $$
DECLARE
  cfg record;
  new_company_id uuid;
  existing_count integer;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM guest_payment_companies;
  IF existing_count > 0 THEN
    RETURN;
  END IF;

  FOR cfg IN SELECT * FROM guest_payment_config LOOP
    INSERT INTO guest_payment_companies (
      name, enabled, sort_order,
      search_api_1, search_api_2, success_api_call,
      grid_1_columns, grid_2_columns,
      receipt_subject_template, receipt_body_template,
      receipt_from_email, receipt_to_email, receipt_sending_account_id
    ) VALUES (
      'Default',
      true,
      0,
      COALESCE(cfg.search_api_1, '{}'::jsonb),
      COALESCE(cfg.search_api_2, '{}'::jsonb),
      COALESCE(cfg.success_api_call, '{}'::jsonb),
      COALESCE(cfg.grid_1_columns, '[]'::jsonb),
      COALESCE(cfg.grid_2_columns, '[]'::jsonb),
      COALESCE(cfg.receipt_subject_template, 'Your payment receipt'),
      COALESCE(cfg.receipt_body_template, 'Thank you for your payment.'),
      COALESCE(cfg.receipt_from_email, ''),
      COALESCE(cfg.receipt_to_email, '{guest_email}'),
      cfg.receipt_sending_account_id
    ) RETURNING id INTO new_company_id;

    UPDATE guest_payment_config
      SET default_company_id = new_company_id,
          updated_at = now()
      WHERE id = cfg.id AND default_company_id IS NULL;
  END LOOP;
END $$;