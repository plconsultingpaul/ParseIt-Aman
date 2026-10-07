-- Allow authenticated users to update their own submissions
-- This fixes the bug where client users submit an order, the status is set to
-- 'processing' via INSERT, but the subsequent UPDATE to 'completed' is blocked
-- by RLS because only admins had UPDATE permission.
CREATE POLICY "Users can update own order_entry_submissions"
  ON order_entry_submissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
