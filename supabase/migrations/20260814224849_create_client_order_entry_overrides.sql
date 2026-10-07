/*
# Create Client Order Entry Override Tables

1. New Tables
  - `client_order_entry_group_overrides`
    - `id` (uuid, primary key) - unique identifier
    - `client_id` (uuid, FK to clients) - the client this override applies to
    - `field_group_id` (uuid, not null) - the template field group ID to hide
    - `is_hidden` (boolean, default true) - whether the group is hidden for this client
    - Unique constraint on (client_id, field_group_id)
  - `client_order_entry_field_overrides`
    - `id` (uuid, primary key) - unique identifier
    - `client_id` (uuid, FK to clients) - the client this override applies to
    - `field_id` (uuid, not null) - the template field ID to override
    - `is_required_override` (boolean, nullable) - override required status (null = use template default)
    - `hidden_dropdown_options` (text[], default '{}') - dropdown option values to hide for this client
    - Unique constraint on (client_id, field_id)

2. Security
  - Enable RLS on both tables
  - Authenticated users can read/write (admin-managed via settings)

3. Notes
  - These tables allow per-client customization of a shared order entry template
  - Group overrides let admins hide entire field group sections for specific clients
  - Field overrides let admins hide specific dropdown options and change required status per client
  - Cascade delete on client_id ensures overrides are cleaned up when a client is deleted
*/

CREATE TABLE IF NOT EXISTS client_order_entry_group_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  field_group_id uuid NOT NULL,
  is_hidden boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, field_group_id)
);

CREATE TABLE IF NOT EXISTS client_order_entry_field_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  field_id uuid NOT NULL,
  is_required_override boolean,
  hidden_dropdown_options text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, field_id)
);

ALTER TABLE client_order_entry_group_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_order_entry_field_overrides ENABLE ROW LEVEL SECURITY;

-- Group overrides policies
DROP POLICY IF EXISTS "select_group_overrides" ON client_order_entry_group_overrides;
CREATE POLICY "select_group_overrides" ON client_order_entry_group_overrides FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_group_overrides" ON client_order_entry_group_overrides;
CREATE POLICY "insert_group_overrides" ON client_order_entry_group_overrides FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_group_overrides" ON client_order_entry_group_overrides;
CREATE POLICY "update_group_overrides" ON client_order_entry_group_overrides FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_group_overrides" ON client_order_entry_group_overrides;
CREATE POLICY "delete_group_overrides" ON client_order_entry_group_overrides FOR DELETE
  TO authenticated USING (true);

-- Field overrides policies
DROP POLICY IF EXISTS "select_field_overrides" ON client_order_entry_field_overrides;
CREATE POLICY "select_field_overrides" ON client_order_entry_field_overrides FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_field_overrides" ON client_order_entry_field_overrides;
CREATE POLICY "insert_field_overrides" ON client_order_entry_field_overrides FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_field_overrides" ON client_order_entry_field_overrides;
CREATE POLICY "update_field_overrides" ON client_order_entry_field_overrides FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_field_overrides" ON client_order_entry_field_overrides;
CREATE POLICY "delete_field_overrides" ON client_order_entry_field_overrides FOR DELETE
  TO authenticated USING (true);
