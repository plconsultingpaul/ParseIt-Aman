/*
# Guest Payment — Phase 1 schema

This migration creates the two tables that back the new public Guest Payment feature.
Guests will use a no-login page to look up outstanding bills and pay them via Stripe
Checkout. All configuration is global (one shared row), and each payment attempt is
tracked so we can honor per-Bill-Number post-payment API calls and email receipts.

## New tables

### 1. guest_payment_config (single global row)
Holds the shared, admin-managed configuration used by the public Guest Payment page
and its supporting edge functions.

Columns:
- id (uuid, primary key)
- use_company_logo (boolean) — whether to show the company logo in the header
- header_text (text) — main heading text on the guest page
- header_size (text) — Tailwind-style size token (e.g. lg, xl, 2xl)
- sub_header_text (text) — sub-heading text
- sub_header_size (text) — size token for the sub-heading
- search_boxes (jsonb) — array of { key, label, placeholder, required } for guest inputs
- search_api_1 (jsonb) — first API endpoint config (URL, method, headers, body, response mappings)
- search_api_2 (jsonb) — second API endpoint config, driven by response mappings from search_api_1
- grid_1_columns (jsonb) — column config for the first result grid (Customer ID + Bill)
- grid_2_columns (jsonb) — column config for the second result grid (outstanding bills with checkboxes)
- stripe_publishable_key (text) — public Stripe key exposed to the browser
- stripe_currency (text) — 3-letter ISO currency code, defaults to usd
- stripe_success_url (text) — post-payment success redirect URL
- stripe_cancel_url (text) — post-payment cancel redirect URL
- success_api_call (jsonb) — API endpoint config invoked once per paid Bill Number
- receipt_subject_template (text) — template for the emailed receipt subject
- receipt_body_template (text) — template for the emailed receipt body
- receipt_bcc_email (text) — fallback BCC address if the RECEIPT_BCC_EMAIL secret is not set
- created_at, updated_at (timestamptz)

### 2. guest_payment_transactions
One row per guest checkout attempt, used to keep post-payment work idempotent and
to give admins a history to inspect / retry from.

Columns:
- id (uuid, primary key)
- guest_email (text, required)
- search_inputs (jsonb) — snapshot of the guest's search inputs
- selected_bills (jsonb) — array of { bill_number, amount, snapshot }
- total_amount (numeric) — total charged in the smallest currency unit's decimal form
- currency (text) — currency at checkout time
- stripe_session_id (text, unique)
- stripe_payment_intent_id (text)
- status (text) — pending / paid / failed / expired
- webhook_payload (jsonb) — last Stripe webhook payload received
- success_api_results (jsonb) — array of per-bill call outcomes for the success API
- receipt_sent_at (timestamptz) — when the receipt email was sent
- created_at, updated_at (timestamptz)

## Security

Both tables have Row Level Security enabled.

guest_payment_config
- SELECT/INSERT/UPDATE/DELETE for `authenticated`. Admin gating is enforced in the
  Settings UI (only system admins see the tab). Public reads never hit this table —
  the guest page pulls display-safe config through a dedicated edge function using
  the service role.

guest_payment_transactions
- SELECT for `authenticated` so admins can view the transaction log.
- No INSERT/UPDATE/DELETE policies — all writes go through edge functions using the
  service role, which bypasses RLS. This keeps guests from touching the table
  directly with the anon key.

## Important notes

1. Single-row config: the app enforces a single guest_payment_config row via
   service-layer logic. No SQL uniqueness constraint is added so we can easily
   support additional rows later if the product ever needs per-tenant configs.
2. No destructive operations: this migration only CREATEs. It uses IF NOT EXISTS
   and drops-then-recreates policies so it is safe to re-run.
3. Amounts: `total_amount` is stored as numeric(12,2) in the display currency
   (dollars, not cents). Stripe integration converts to the smallest currency
   unit at Checkout Session creation time.
*/

CREATE TABLE IF NOT EXISTS guest_payment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  use_company_logo boolean NOT NULL DEFAULT true,
  header_text text NOT NULL DEFAULT 'Make a Payment',
  header_size text NOT NULL DEFAULT '3xl',
  sub_header_text text NOT NULL DEFAULT 'Look up and pay your outstanding bills.',
  sub_header_size text NOT NULL DEFAULT 'lg',
  search_boxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_api_1 jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_api_2 jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid_1_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  grid_2_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_publishable_key text NOT NULL DEFAULT '',
  stripe_currency text NOT NULL DEFAULT 'usd',
  stripe_success_url text NOT NULL DEFAULT '',
  stripe_cancel_url text NOT NULL DEFAULT '',
  success_api_call jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_subject_template text NOT NULL DEFAULT 'Your payment receipt',
  receipt_body_template text NOT NULL DEFAULT 'Thank you for your payment. A summary of the bills you paid is included below.',
  receipt_bcc_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE guest_payment_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_guest_payment_config" ON guest_payment_config;
CREATE POLICY "select_guest_payment_config" ON guest_payment_config FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_guest_payment_config" ON guest_payment_config;
CREATE POLICY "insert_guest_payment_config" ON guest_payment_config FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_guest_payment_config" ON guest_payment_config;
CREATE POLICY "update_guest_payment_config" ON guest_payment_config FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_guest_payment_config" ON guest_payment_config;
CREATE POLICY "delete_guest_payment_config" ON guest_payment_config FOR DELETE
  TO authenticated USING (true);


CREATE TABLE IF NOT EXISTS guest_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_email text NOT NULL,
  search_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_bills jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  webhook_payload jsonb,
  success_api_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  receipt_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_payment_transactions_status_idx
  ON guest_payment_transactions (status);
CREATE INDEX IF NOT EXISTS guest_payment_transactions_created_at_idx
  ON guest_payment_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS guest_payment_transactions_guest_email_idx
  ON guest_payment_transactions (guest_email);

ALTER TABLE guest_payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_guest_payment_transactions" ON guest_payment_transactions;
CREATE POLICY "select_guest_payment_transactions" ON guest_payment_transactions FOR SELECT
  TO authenticated USING (true);
