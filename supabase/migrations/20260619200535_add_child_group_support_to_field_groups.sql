-- Add parent_group_id and child_button_label to template field groups
ALTER TABLE order_entry_template_field_groups
  ADD COLUMN IF NOT EXISTS parent_group_id uuid REFERENCES order_entry_template_field_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_button_label text;

-- Add parent_group_id and child_button_label to non-template field groups (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_entry_field_groups') THEN
    EXECUTE 'ALTER TABLE order_entry_field_groups ADD COLUMN IF NOT EXISTS parent_group_id uuid, ADD COLUMN IF NOT EXISTS child_button_label text';
  END IF;
END $$;