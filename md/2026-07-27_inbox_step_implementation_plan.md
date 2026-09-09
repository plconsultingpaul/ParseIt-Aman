# 2026-07-27 — Inbox Review Setup (Phased Implementation Plan)

## Overview

Create a configurable form layout system for the Inbox Review page, allowing admins to define how extracted data is presented to end users. Instead of showing raw JSON or a flat field list, the Review page will render data in structured field groups with a designed layout — similar to how Order Entry templates work.

A new "Review Setup" tab will appear under Type Setup for configuration.

---

## Phase 1: Database Schema

Create the tables needed to store review templates, field groups, fields, and layout positions.

### Tables to Create

1. **`inbox_review_templates`**
   - `id` (uuid, PK)
   - `name` (text) — template name
   - `extraction_type_id` (uuid, FK to extraction_types) — links template to an extraction type
   - `description` (text, nullable)
   - `is_active` (boolean, default true)
   - `created_at` / `updated_at` (timestamptz)

2. **`inbox_review_field_groups`**
   - `id` (uuid, PK)
   - `template_id` (uuid, FK to inbox_review_templates)
   - `group_name` (text)
   - `group_order` (integer)
   - `description` (text, nullable)
   - `is_array_group` (boolean, default false)
   - `array_json_path` (text, nullable) — JSON path for array groups
   - `is_collapsed_by_default` (boolean, default false)
   - `created_at` / `updated_at` (timestamptz)

3. **`inbox_review_fields`**
   - `id` (uuid, PK)
   - `group_id` (uuid, FK to inbox_review_field_groups)
   - `field_name` (text) — internal name
   - `field_label` (text) — display label
   - `field_type` (text) — text, number, date, dropdown, boolean, readonly
   - `json_path` (text) — dot-notation path to the value in extracted JSON
   - `field_order` (integer)
   - `is_required` (boolean, default false)
   - `is_editable` (boolean, default true) — can user change this value?
   - `is_visible` (boolean, default true)
   - `placeholder` (text, nullable)
   - `help_text` (text, nullable)
   - `dropdown_options` (jsonb, nullable) — for dropdown type fields
   - `validation_regex` (text, nullable)
   - `max_length` (integer, nullable)
   - `created_at` / `updated_at` (timestamptz)

4. **`inbox_review_field_layout`**
   - `id` (uuid, PK)
   - `field_id` (uuid, FK to inbox_review_fields)
   - `row_index` (integer)
   - `column_index` (integer)
   - `width_columns` (integer, default 6) — out of 12-column grid
   - `mobile_width_columns` (integer, default 12)
   - `created_at` / `updated_at` (timestamptz)

### RLS Policies
- All tables: authenticated users with appropriate permissions can CRUD.

---

## Phase 2: Review Setup Admin UI

Add a "Review Setup" tab to the Type Setup page with the configuration interface.

### What to Build

1. **New tab in TypeSetupPage** — "Review Setup" with a form/layout icon
2. **ReviewSetupSettings component** — the main admin panel containing:
   - Template selector dropdown (linked to extraction types)
   - Field Groups section (add, edit, delete, reorder groups)
   - Fields section within each group (add, edit, delete fields, set JSON path, label, type, editability)
   - Layout Designer integration (reuse or adapt existing `LayoutDesigner.tsx`)
3. **JSON Path Picker** — helper that shows the JSON structure from a sample extraction and lets the admin click to select a path (nice-to-have, can also type manually)

### Key Interactions
- Select an extraction type -> loads or creates the review template for it
- Add field groups -> configure group name, order, array settings
- Add fields to groups -> set label, JSON path, field type, editability
- Switch to Layout tab -> drag/arrange fields on the 12-column grid
- Save all changes on the fly (debounced, same pattern as Order Entry templates)

---

## Phase 3: Review Page Rendering

Update the Inbox Review page to use the configured template when one exists.

### What to Build

1. **Template loading** — When opening an inbox item, check if its extraction type has an active review template
2. **Structured view toggle** — Add a third view option: "Form View" (alongside existing Raw JSON and Field View). If a template exists, default to Form View.
3. **Form renderer** — Render the field groups and fields according to the layout:
   - Group cards with headers
   - 12-column grid rows with proper widths
   - Field components by type (text input, number, date picker using custom DatePicker, dropdown using CustomDropdown, boolean toggle, readonly display)
   - Array groups rendered as tables (like GroupedArrayTable)
4. **Data binding** — Read values from the extracted JSON using configured `json_path`, write edits back to the JSON at the same paths
5. **Validation** — Apply configured rules (required, regex, max length) before accept
6. **Fallback** — If no template configured for the extraction type, show the existing raw/field views as today

---

## Phase 4: Polish and Enhancements

1. **Template import/export** — JSON export/import for review templates (same pattern as Order Entry template export)
2. **Conditional visibility** — Show/hide fields based on other field values
3. **Field copy from Order Entry** — Allow copying field group definitions from Order Entry templates
4. **Preview in admin** — Preview the form layout with sample data while configuring
5. **Per-client overrides** — Allow different clients to see different review templates (future)

---

## Dependencies and Notes

- The Layout Designer component (`LayoutDesigner.tsx`) should be reusable with minimal changes — it accepts generic field/group/layout arrays
- Custom form field components already exist in `src/components/form-fields/` and should be reused for the review form rendering
- The existing `CustomDropdown` component should be used for any dropdown fields in both the admin config and the review form
- Edit buttons should use pencil icons (lucide `Pencil` or `Edit2`)
- Date pickers should use the existing custom `DatePicker` component
- The review template is linked to extraction types because that determines the JSON structure

---

## File Impact Estimate

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | 0 (migration only) | 0 |
| 2 | 1-2 (ReviewSetupSettings, service) | TypeSetupPage.tsx, types/index.ts |
| 3 | 1 (InboxReviewFormView or similar) | InboxReviewPage.tsx |
| 4 | 0-1 | Various existing |
