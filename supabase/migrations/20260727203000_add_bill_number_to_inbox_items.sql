/*
# Add bill_number column to inbox_items

1. Modified Tables
   - `inbox_items`
     - Added `bill_number` (text, nullable) — stores the bill/order number returned
       by the API after an inbox item is accepted and the workflow resumes.

2. Important Notes
   - No existing data is affected; the column defaults to NULL.
   - The inbox-resolve edge function will populate this field after a successful
     workflow resume that returns an API response containing a bill number.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_items' AND column_name = 'bill_number'
  ) THEN
    ALTER TABLE inbox_items ADD COLUMN bill_number text;
  END IF;
END $$;