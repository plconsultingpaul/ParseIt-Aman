/*
# Add mobile app visibility flag to Execute Flows

1. Modified Tables
   - `execute_buttons`
     - Add `visible_in_mobile` (boolean, not null, default false)
       Controls whether an Execute Flow is offered to users inside the Parse-It
       mobile app. This is an independent toggle, separate from the existing
       `qr_code_enabled` flag.

2. Indexes
   - Add a partial index on `execute_buttons (visible_in_mobile)` limited to
     active, mobile-visible rows, so the mobile app can efficiently list the
     flows it should show.

3. Security
   - No RLS changes. Existing read policies on `execute_buttons` continue to
     apply; this only adds a column and an index.

4. Notes
   1. The column defaults to false, so existing flows stay hidden from the
      mobile app until an admin explicitly enables them.
   2. A mobile-visible flow is reached through the same `/execute/<slug>` link
      used by QR codes; the application layer ensures a slug exists whenever this
      flag is on.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'execute_buttons'
      AND column_name = 'visible_in_mobile'
  ) THEN
    ALTER TABLE execute_buttons
      ADD COLUMN visible_in_mobile boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_execute_buttons_visible_in_mobile
  ON execute_buttons (visible_in_mobile)
  WHERE visible_in_mobile = true AND is_active = true;
