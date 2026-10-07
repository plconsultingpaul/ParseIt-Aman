ALTER TABLE guest_payment_config
  ADD COLUMN IF NOT EXISTS logo_size text NOT NULL DEFAULT 'md';
