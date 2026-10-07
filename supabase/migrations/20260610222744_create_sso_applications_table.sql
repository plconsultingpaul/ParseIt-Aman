/*
# Create SSO Applications Table

## Description
Creates the `sso_applications` table to store Quick Switch SSO application configurations.
Admins configure applications here which then appear in the user menu "Quick Switch" section,
allowing users to SSO into other applications.

## New Tables
- `sso_applications`
  - `id` (uuid, primary key) - unique identifier
  - `name` (text, not null) - display name shown in Quick Switch menu
  - `url` (text, not null) - base URL of the target application
  - `app_identifier` (text, not null) - must match target app's SSO_CURRENT_APP_ID
  - `icon_url` (text, nullable) - optional icon for the application
  - `sort_order` (integer, default 0) - controls display order in menu
  - `is_active` (boolean, default true) - whether app is shown in Quick Switch
  - `created_at` (timestamptz) - creation timestamp
  - `updated_at` (timestamptz) - last update timestamp

## Security
- RLS enabled on `sso_applications`
- All authenticated users can SELECT (to populate Quick Switch menu)
- Only admins can INSERT, UPDATE, DELETE (via is_admin() helper)
*/

CREATE TABLE IF NOT EXISTS sso_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  app_identifier text NOT NULL,
  icon_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sso_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select sso_applications" ON sso_applications;
CREATE POLICY "Authenticated users can select sso_applications" ON sso_applications FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert sso_applications" ON sso_applications;
CREATE POLICY "Admins can insert sso_applications" ON sso_applications FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update sso_applications" ON sso_applications;
CREATE POLICY "Admins can update sso_applications" ON sso_applications FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete sso_applications" ON sso_applications;
CREATE POLICY "Admins can delete sso_applications" ON sso_applications FOR DELETE
  TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_sso_applications_sort_order ON sso_applications(sort_order);
