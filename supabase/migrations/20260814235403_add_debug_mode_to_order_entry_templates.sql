/*
# Add debug mode and custom error message to order entry templates

1. Modified Tables
   - `order_entry_templates`
     - `debug_mode` (boolean, default true) - When true, raw API errors are shown. When false, the custom error message is shown instead.
     - `custom_error_message` (text, nullable) - The user-defined error message displayed when debug mode is off.

2. Important Notes
   - debug_mode defaults to true so existing templates continue showing raw errors (current behavior).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_entry_templates' AND column_name = 'debug_mode'
  ) THEN
    ALTER TABLE order_entry_templates ADD COLUMN debug_mode boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_entry_templates' AND column_name = 'custom_error_message'
  ) THEN
    ALTER TABLE order_entry_templates ADD COLUMN custom_error_message text;
  END IF;
END $$;