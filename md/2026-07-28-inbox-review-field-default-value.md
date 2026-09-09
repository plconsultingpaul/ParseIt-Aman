# 2026-07-28 Inbox Review Field Default Value Support

## Problem

When a user adds a new row to an Array group in the Inbox Review form, all fields are initialized as blank. The existing "Placeholder" setting only shows greyed-out hint text and does not actually set the field value. There was no way to pre-populate a new row with a configured default.

## Changes

### 1. Database
- Added `default_value` (text, nullable) column to the `inbox_review_fields` table via migration.

### 2. TypeScript Type
- Added `defaultValue: string | null` to the `InboxReviewField` interface.

### 3. Service Layer (reviewSetupService.ts)
- `mapField()` now reads `row.default_value` into `defaultValue`.
- `createField()` persists `default_value` on insert.
- `updateField()` persists `default_value` on update.

### 4. Settings UI (ReviewFieldGroupsManager.tsx)
- Added a "Default Value" text input in the field editor, next to the existing Placeholder input.
- The field form state now includes `defaultValue`.
- All three save paths (create, update-existing, and add-another) include the new property.

### 5. Form View (InboxReviewFormView.tsx)
- `handleAddRow()` now uses `field.defaultValue || ''` when building a new row, so the configured default is pre-filled in the new row's cells.

## Result
Admins can now set a "Default Value" for any field in a Review Template. When a reviewer clicks "Add Row" on an array group, each field in the new row is pre-populated with its configured default value instead of being blank.
