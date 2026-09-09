# 2026-07-29 — Inbox Review Timestamp Field Type

## Summary
Added a new "Timestamp" field type to Inbox Review Templates that lets users select both a date and a time.

## What Changed

### Database Migration
- Updated the `field_type` CHECK constraint on `inbox_review_fields` to include `'timestamp'` as an allowed value alongside the existing types (text, number, date, dropdown, boolean, readonly).

### TypeScript Type
- Added `'timestamp'` to the `InboxReviewFieldType` union type.

### Setup Page — Review Field Groups Manager
- Added `{ value: 'timestamp', label: 'Timestamp' }` to the field type dropdown so it appears as an option when editing a field.

### Inbox Review Form View
- Added timestamp rendering in both the full form view and the compact array/grid view.
- The timestamp field renders the custom DatePicker and TimePicker side by side, allowing users to select a date and time independently.
- The combined value is stored as `YYYY-MM-DD h:mm AM/PM` format.

## Behavior
- When a field is configured as "Timestamp", the review form shows two pickers side by side: a date calendar and a time selector.
- Both use the same custom picker components used elsewhere in the app (Order Entry, etc.).
- Clearing either picker clears that portion of the value.
