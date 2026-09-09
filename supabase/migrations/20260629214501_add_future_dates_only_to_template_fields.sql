ALTER TABLE order_entry_template_fields
ADD COLUMN IF NOT EXISTS future_dates_only boolean NOT NULL DEFAULT false;