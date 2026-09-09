/*
# Create Inbox Review Template Tables

## Summary
Creates the schema for configurable form layouts on the Inbox Review page.
Admins can define how extracted JSON data is presented to end users by
configuring field groups, fields (mapped to JSON paths), and a 12-column
grid layout — similar to the Order Entry template system.

## New Tables

1. `inbox_review_templates`
   - `id` (uuid, PK) — unique template identifier
   - `name` (text) — template display name
   - `extraction_type_id` (uuid, FK to extraction_types) — links template to an extraction type
   - `description` (text, nullable) — optional description
   - `is_active` (boolean, default true) — whether this template is active
   - `created_at` (timestamptz) — creation timestamp
   - `updated_at` (timestamptz) — last update timestamp

2. `inbox_review_field_groups`
   - `id` (uuid, PK) — unique group identifier
   - `template_id` (uuid, FK to inbox_review_templates) — parent template
   - `group_name` (text) — display name for the group
   - `group_order` (integer) — sort order within the template
   - `description` (text, nullable) — optional description
   - `is_array_group` (boolean, default false) — whether this group renders repeated rows
   - `array_json_path` (text, nullable) — JSON path to the array for array groups
   - `is_collapsed_by_default` (boolean, default false) — initial collapsed state
   - `created_at` (timestamptz) — creation timestamp
   - `updated_at` (timestamptz) — last update timestamp

3. `inbox_review_fields`
   - `id` (uuid, PK) — unique field identifier
   - `group_id` (uuid, FK to inbox_review_field_groups) — parent group
   - `field_name` (text) — internal field name
   - `field_label` (text) — user-facing label
   - `field_type` (text) — one of: text, number, date, dropdown, boolean, readonly
   - `json_path` (text) — dot-notation path to the value in extracted JSON
   - `field_order` (integer) — sort order within the group
   - `is_required` (boolean, default false) — whether the field is required
   - `is_editable` (boolean, default true) — whether users can edit the value
   - `is_visible` (boolean, default true) — whether the field is displayed
   - `placeholder` (text, nullable) — placeholder text for editable fields
   - `help_text` (text, nullable) — helper tooltip text
   - `dropdown_options` (jsonb, nullable) — options for dropdown type fields
   - `validation_regex` (text, nullable) — regex pattern for validation
   - `max_length` (integer, nullable) — max character length
   - `created_at` (timestamptz) — creation timestamp
   - `updated_at` (timestamptz) — last update timestamp

4. `inbox_review_field_layout`
   - `id` (uuid, PK) — unique layout record identifier
   - `field_id` (uuid, FK to inbox_review_fields) — the field being positioned
   - `row_index` (integer) — row position in the grid
   - `column_index` (integer) — column position within the row
   - `width_columns` (integer, default 6) — desktop width out of 12 columns
   - `mobile_width_columns` (integer, default 12) — mobile width out of 12 columns
   - `created_at` (timestamptz) — creation timestamp
   - `updated_at` (timestamptz) — last update timestamp

## Security
- RLS enabled on all 4 tables.
- Authenticated users can perform full CRUD (admin-level access).

## Notes
1. The template is linked to extraction_types because that determines the JSON structure of extracted data.
2. The field_type check constraint allows: text, number, date, dropdown, boolean, readonly.
3. Cascade deletes ensure removing a template cleans up all child groups, fields, and layouts.
*/

-- 1. inbox_review_templates
CREATE TABLE IF NOT EXISTS inbox_review_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  extraction_type_id uuid NOT NULL REFERENCES extraction_types(id) ON DELETE CASCADE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_review_templates_extraction_type
  ON inbox_review_templates(extraction_type_id);

ALTER TABLE inbox_review_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_inbox_review_templates" ON inbox_review_templates;
CREATE POLICY "authenticated_select_inbox_review_templates"
  ON inbox_review_templates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_inbox_review_templates" ON inbox_review_templates;
CREATE POLICY "authenticated_insert_inbox_review_templates"
  ON inbox_review_templates FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_inbox_review_templates" ON inbox_review_templates;
CREATE POLICY "authenticated_update_inbox_review_templates"
  ON inbox_review_templates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_inbox_review_templates" ON inbox_review_templates;
CREATE POLICY "authenticated_delete_inbox_review_templates"
  ON inbox_review_templates FOR DELETE
  TO authenticated USING (true);

-- 2. inbox_review_field_groups
CREATE TABLE IF NOT EXISTS inbox_review_field_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES inbox_review_templates(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  group_order integer NOT NULL DEFAULT 0,
  description text,
  is_array_group boolean NOT NULL DEFAULT false,
  array_json_path text,
  is_collapsed_by_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_review_field_groups_template
  ON inbox_review_field_groups(template_id);

ALTER TABLE inbox_review_field_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_inbox_review_field_groups" ON inbox_review_field_groups;
CREATE POLICY "authenticated_select_inbox_review_field_groups"
  ON inbox_review_field_groups FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_inbox_review_field_groups" ON inbox_review_field_groups;
CREATE POLICY "authenticated_insert_inbox_review_field_groups"
  ON inbox_review_field_groups FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_inbox_review_field_groups" ON inbox_review_field_groups;
CREATE POLICY "authenticated_update_inbox_review_field_groups"
  ON inbox_review_field_groups FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_inbox_review_field_groups" ON inbox_review_field_groups;
CREATE POLICY "authenticated_delete_inbox_review_field_groups"
  ON inbox_review_field_groups FOR DELETE
  TO authenticated USING (true);

-- 3. inbox_review_fields
CREATE TABLE IF NOT EXISTS inbox_review_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES inbox_review_field_groups(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text', 'number', 'date', 'dropdown', 'boolean', 'readonly')),
  json_path text NOT NULL,
  field_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  is_editable boolean NOT NULL DEFAULT true,
  is_visible boolean NOT NULL DEFAULT true,
  placeholder text,
  help_text text,
  dropdown_options jsonb,
  validation_regex text,
  max_length integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_review_fields_group
  ON inbox_review_fields(group_id);

ALTER TABLE inbox_review_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_inbox_review_fields" ON inbox_review_fields;
CREATE POLICY "authenticated_select_inbox_review_fields"
  ON inbox_review_fields FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_inbox_review_fields" ON inbox_review_fields;
CREATE POLICY "authenticated_insert_inbox_review_fields"
  ON inbox_review_fields FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_inbox_review_fields" ON inbox_review_fields;
CREATE POLICY "authenticated_update_inbox_review_fields"
  ON inbox_review_fields FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_inbox_review_fields" ON inbox_review_fields;
CREATE POLICY "authenticated_delete_inbox_review_fields"
  ON inbox_review_fields FOR DELETE
  TO authenticated USING (true);

-- 4. inbox_review_field_layout
CREATE TABLE IF NOT EXISTS inbox_review_field_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES inbox_review_fields(id) ON DELETE CASCADE,
  row_index integer NOT NULL DEFAULT 0,
  column_index integer NOT NULL DEFAULT 0,
  width_columns integer NOT NULL DEFAULT 6,
  mobile_width_columns integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_review_field_layout_field
  ON inbox_review_field_layout(field_id);

ALTER TABLE inbox_review_field_layout ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_inbox_review_field_layout" ON inbox_review_field_layout;
CREATE POLICY "authenticated_select_inbox_review_field_layout"
  ON inbox_review_field_layout FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_inbox_review_field_layout" ON inbox_review_field_layout;
CREATE POLICY "authenticated_insert_inbox_review_field_layout"
  ON inbox_review_field_layout FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_inbox_review_field_layout" ON inbox_review_field_layout;
CREATE POLICY "authenticated_update_inbox_review_field_layout"
  ON inbox_review_field_layout FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_inbox_review_field_layout" ON inbox_review_field_layout;
CREATE POLICY "authenticated_delete_inbox_review_field_layout"
  ON inbox_review_field_layout FOR DELETE
  TO authenticated USING (true);
