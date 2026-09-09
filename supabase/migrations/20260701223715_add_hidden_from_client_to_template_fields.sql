ALTER TABLE order_entry_template_fields
ADD COLUMN IF NOT EXISTS hidden_from_client boolean NOT NULL DEFAULT false;