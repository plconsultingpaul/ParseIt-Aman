/*
# Add Count Child Array Records to Template Fields

1. Modified Tables
   - `order_entry_template_fields`
     - `count_child_array_records` (boolean, default false) - When enabled, field value is auto-populated with the count of entries in the specified child array group
     - `count_child_array_group_id` (uuid, nullable, references order_entry_template_field_groups) - The child group whose entries will be counted

2. Important Notes
   - This feature is intended for hidden-from-client fields that need to report the number of child array entries to the API
   - Example: A "Details" parent group has a child "Dimensions" group. A field in "Details" can be configured to count Dimensions entries per row.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'order_entry_template_fields'
    AND column_name = 'count_child_array_records'
  ) THEN
    ALTER TABLE order_entry_template_fields
    ADD COLUMN count_child_array_records boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'order_entry_template_fields'
    AND column_name = 'count_child_array_group_id'
  ) THEN
    ALTER TABLE order_entry_template_fields
    ADD COLUMN count_child_array_group_id uuid REFERENCES order_entry_template_field_groups(id) ON DELETE SET NULL;
  END IF;
END $$;