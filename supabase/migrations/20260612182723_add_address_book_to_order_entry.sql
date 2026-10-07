-- Add address book support to field groups
ALTER TABLE order_entry_template_field_groups
  ADD COLUMN IF NOT EXISTS address_book_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_book_type text DEFAULT null;

-- Add address book field mapping to template fields
ALTER TABLE order_entry_template_fields
  ADD COLUMN IF NOT EXISTS address_book_field text DEFAULT null;
