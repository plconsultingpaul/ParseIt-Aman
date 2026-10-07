/*
# Add configurable surcharge to Guest Payment

1. Modified Tables
- `guest_payment_config`
  - `surcharge_enabled` (boolean, default false) - turns the service charge on/off
  - `surcharge_percent` (numeric, default 3) - percentage added to the selected payment
  - `surcharge_label` (text, default 'Surcharge') - label shown to guests and on Stripe
- `guest_payment_transactions`
  - `subtotal_amount` (numeric, nullable) - sum of selected bills before surcharge
  - `surcharge_amount` (numeric, default 0) - surcharge charged
  - `surcharge_percent` (numeric, nullable) - rate applied at the time of payment

2. Security
- No policy changes; existing RLS on both tables still applies.

3. Notes
- `total_amount` on transactions continues to hold the final amount charged (subtotal + surcharge).
*/

ALTER TABLE guest_payment_config ADD COLUMN IF NOT EXISTS surcharge_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE guest_payment_config ADD COLUMN IF NOT EXISTS surcharge_percent numeric NOT NULL DEFAULT 3;
ALTER TABLE guest_payment_config ADD COLUMN IF NOT EXISTS surcharge_label text NOT NULL DEFAULT 'Surcharge';

ALTER TABLE guest_payment_transactions ADD COLUMN IF NOT EXISTS subtotal_amount numeric;
ALTER TABLE guest_payment_transactions ADD COLUMN IF NOT EXISTS surcharge_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE guest_payment_transactions ADD COLUMN IF NOT EXISTS surcharge_percent numeric;