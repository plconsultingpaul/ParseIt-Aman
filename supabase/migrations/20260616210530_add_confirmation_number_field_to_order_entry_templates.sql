ALTER TABLE public.order_entry_templates
ADD COLUMN IF NOT EXISTS confirmation_number_field text NULL;