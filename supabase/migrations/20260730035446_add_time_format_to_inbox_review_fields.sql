/*
  # Add time_format to inbox_review_fields

  1. Modified Tables
     - `inbox_review_fields`
       - Added `time_format` (text, default '12h') controlling how the Timestamp
         field's time is entered/displayed: '12h' (AM/PM) or '24h'.

  2. Important Notes
     - Defaults to '12h' so existing timestamp fields keep their current behavior.
     - Only relevant for fields with field_type = 'timestamp'.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_review_fields' AND column_name = 'time_format'
  ) THEN
    ALTER TABLE inbox_review_fields
      ADD COLUMN time_format text NOT NULL DEFAULT '12h'
      CHECK (time_format IN ('12h', '24h'));
  END IF;
END $$;