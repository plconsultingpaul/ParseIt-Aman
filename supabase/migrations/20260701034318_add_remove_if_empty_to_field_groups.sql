-- Add remove_if_empty flag to order_entry_field_groups (global config)
ALTER TABLE order_entry_field_groups
ADD COLUMN IF NOT EXISTS remove_if_empty boolean NOT NULL DEFAULT false;

-- Add remove_if_empty flag to order_entry_template_field_groups (template-specific)
ALTER TABLE order_entry_template_field_groups
ADD COLUMN IF NOT EXISTS remove_if_empty boolean NOT NULL DEFAULT false;