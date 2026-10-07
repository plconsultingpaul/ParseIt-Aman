-- Add conditional visibility columns
ALTER TABLE order_entry_template_fields
  ADD COLUMN IF NOT EXISTS conditional_visibility_field_id uuid REFERENCES order_entry_template_fields(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conditional_visibility_operator text,
  ADD COLUMN IF NOT EXISTS conditional_visibility_value text;

-- Add conditional required columns
ALTER TABLE order_entry_template_fields
  ADD COLUMN IF NOT EXISTS conditional_required_field_id uuid REFERENCES order_entry_template_fields(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conditional_required_operator text,
  ADD COLUMN IF NOT EXISTS conditional_required_value text;