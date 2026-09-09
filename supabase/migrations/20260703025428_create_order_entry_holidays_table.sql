/*
# Create Order Entry Holidays Table

1. New Tables
  - `order_entry_holidays`
    - `id` (uuid, primary key)
    - `name` (text, not null) - Holiday name (e.g., "Christmas Day")
    - `date` (date, not null) - The date of the holiday
    - `recurring` (boolean, default false) - If true, repeats every year (month/day only)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - Enable RLS on `order_entry_holidays`
  - Allow authenticated users to read holidays
  - Allow authenticated users to manage holidays (admin-controlled via frontend)

3. Notes
  - This table stores company-observed holidays used to restrict date selection in order entry forms
  - When `recurring` is true, only month and day are matched regardless of year
*/

CREATE TABLE IF NOT EXISTS order_entry_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  recurring boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE order_entry_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_holidays" ON order_entry_holidays;
CREATE POLICY "authenticated_select_holidays" ON order_entry_holidays FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_holidays" ON order_entry_holidays;
CREATE POLICY "authenticated_insert_holidays" ON order_entry_holidays FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_holidays" ON order_entry_holidays;
CREATE POLICY "authenticated_update_holidays" ON order_entry_holidays FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_holidays" ON order_entry_holidays;
CREATE POLICY "authenticated_delete_holidays" ON order_entry_holidays FOR DELETE
  TO authenticated USING (true);