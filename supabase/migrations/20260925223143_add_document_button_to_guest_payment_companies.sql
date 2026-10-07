-- Adds a per-company Row Document Button configuration used by the customer-facing
-- Guest Payment page. Stored as JSONB so shape can evolve without new migrations.
ALTER TABLE guest_payment_companies
  ADD COLUMN IF NOT EXISTS document_button jsonb NOT NULL DEFAULT '{}'::jsonb;
