/*
# Add 'failed' status to inbox_items

1. Modified Tables
   - `inbox_items`
     - Updated status CHECK constraint to allow 'failed' in addition to 'pending', 'accepted', 'rejected'
     - Added `failure_reason` (text, nullable) to store why an accept attempt failed

2. Important Notes
   - A 'failed' item remains visible in the Pending view so users can resolve and re-attempt
   - The failure_reason stores a human-readable explanation (e.g. "No bill number returned")
*/

-- Update the status CHECK constraint to include 'failed'
ALTER TABLE inbox_items
  DROP CONSTRAINT IF EXISTS inbox_items_status_check;

ALTER TABLE inbox_items
  ADD CONSTRAINT inbox_items_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'failed'));

-- Add failure_reason column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbox_items' AND column_name = 'failure_reason'
  ) THEN
    ALTER TABLE inbox_items ADD COLUMN failure_reason TEXT;
  END IF;
END $$;
