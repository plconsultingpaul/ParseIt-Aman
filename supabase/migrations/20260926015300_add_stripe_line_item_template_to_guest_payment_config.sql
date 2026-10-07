/*
  # Add Stripe line item name template to guest payment config

  Adds a globally-configurable template used to compose Stripe Checkout
  line item names. Supports `{bill_number}` and `{amount}` placeholders.
  Defaults to "Freight Invoice {bill_number}".
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_payment_config'
      AND column_name = 'stripe_line_item_name_template'
  ) THEN
    ALTER TABLE guest_payment_config
      ADD COLUMN stripe_line_item_name_template TEXT NOT NULL DEFAULT 'Freight Invoice {bill_number}';
  END IF;
END $$;
