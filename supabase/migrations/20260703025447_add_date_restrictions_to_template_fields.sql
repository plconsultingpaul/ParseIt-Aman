/*
# Add allow_weekends and allow_holidays to template fields

1. Modified Tables
  - `order_entry_template_fields`
    - `allow_weekends` (boolean, default true) - When false, weekends are disabled in date picker
    - `allow_holidays` (boolean, default true) - When false, holidays from order_entry_holidays table are disabled

2. Notes
  - Defaults to true (permissive) so existing date fields are unaffected
  - Only applies to date and datetime field types (enforced at UI level)
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'allow_weekends') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN allow_weekends boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_entry_template_fields' AND column_name = 'allow_holidays') THEN
    ALTER TABLE order_entry_template_fields ADD COLUMN allow_holidays boolean NOT NULL DEFAULT true;
  END IF;
END $$;