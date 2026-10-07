/*
# Add Dynamic Label and Omit If Empty to Order Entry Template Fields

1. Modified Tables
   - `order_entry_template_fields`
     - `omit_if_empty` (boolean, default false) - When true, field value is excluded from API payload if empty/null
     - `dynamic_label_field_id` (uuid, nullable) - FK to another field that triggers a label change
     - `dynamic_label_operator` (text, nullable) - Condition operator (equals, not_equals, etc.)
     - `dynamic_label_value` (text, nullable) - Condition comparison value
     - `dynamic_label_text` (text, nullable) - The alternate label to show when condition is met
   - `order_entry_fields` (global fields table)
     - Same 5 columns added for consistency

2. Important Notes
   - Dynamic label allows a single field to display different labels based on another field's value
   - Omit if empty prevents empty/null fields from being sent to the API
   - Both features work with the existing conditional visibility system
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'omit_if_empty') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN omit_if_empty boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'dynamic_label_field_id') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN dynamic_label_field_id uuid REFERENCES order_entry_template_fields(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'dynamic_label_operator') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN dynamic_label_operator text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'dynamic_label_value') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN dynamic_label_value text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'dynamic_label_text') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN dynamic_label_text text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_fields' AND column_name = 'omit_if_empty') THEN
    ALTER TABLE order_entry_fields ADD COLUMN omit_if_empty boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_fields' AND column_name = 'dynamic_label_field_id') THEN
    ALTER TABLE order_entry_fields ADD COLUMN dynamic_label_field_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_fields' AND column_name = 'dynamic_label_operator') THEN
    ALTER TABLE order_entry_fields ADD COLUMN dynamic_label_operator text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_fields' AND column_name = 'dynamic_label_value') THEN
    ALTER TABLE order_entry_fields ADD COLUMN dynamic_label_value text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_fields' AND column_name = 'dynamic_label_text') THEN
    ALTER TABLE order_entry_fields ADD COLUMN dynamic_label_text text;
  END IF;
END $$;