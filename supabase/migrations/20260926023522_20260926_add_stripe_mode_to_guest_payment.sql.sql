/*
# Add Stripe Live/Test Mode to Guest Payment

Adds a mode toggle so the guest payment feature can run in either Live or Test
mode without swapping edge function secrets. Test mode uses Stripe's real test
environment (no money moves) and pairs with a dedicated test publishable key
stored alongside the live one. Transactions record which mode they were created
under so the webhook can validate incoming events against the stored mode.

1. Modified Tables
- `guest_payment_config`
  - `stripe_mode` (text, not null, default 'live') — either 'live' or 'test'.
  - `stripe_test_publishable_key` (text, not null, default '') — Stripe test-mode
    publishable key (pk_test_...) used by the guest checkout page when the mode
    is set to 'test'. The existing `stripe_publishable_key` stays as the live
    publishable key.
- `guest_payment_transactions`
  - `stripe_mode` (text, not null, default 'live') — records whether the checkout
    session was created in Live or Test mode. Used by the webhook to verify
    the incoming Stripe event matches the expected mode.

2. Security
- No RLS changes. Existing policies continue to apply.

3. Important Notes
  1. Existing rows default to 'live' so behavior is unchanged for anyone who
     doesn't explicitly opt in to Test mode.
  2. When mode is 'test', the server picks the `STRIPE_TEST_SECRET_KEY` edge
     function secret; the live `STRIPE_SECRET_KEY` continues to power live mode.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_payment_config' AND column_name = 'stripe_mode'
  ) THEN
    ALTER TABLE guest_payment_config
      ADD COLUMN stripe_mode text NOT NULL DEFAULT 'live';
    ALTER TABLE guest_payment_config
      ADD CONSTRAINT guest_payment_config_stripe_mode_check
      CHECK (stripe_mode IN ('live', 'test'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_payment_config' AND column_name = 'stripe_test_publishable_key'
  ) THEN
    ALTER TABLE guest_payment_config
      ADD COLUMN stripe_test_publishable_key text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_payment_transactions' AND column_name = 'stripe_mode'
  ) THEN
    ALTER TABLE guest_payment_transactions
      ADD COLUMN stripe_mode text NOT NULL DEFAULT 'live';
    ALTER TABLE guest_payment_transactions
      ADD CONSTRAINT guest_payment_transactions_stripe_mode_check
      CHECK (stripe_mode IN ('live', 'test'));
  END IF;
END $$;
