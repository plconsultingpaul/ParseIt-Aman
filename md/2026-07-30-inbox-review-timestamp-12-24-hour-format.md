# 2026-07-30 — Inbox Review Timestamp 12/24-Hour Format

## Summary
Added a per-field "Time Format" choice (12-hour AM/PM or 24-hour) for Timestamp
fields in Inbox Review Templates. The selected format controls how the time is
entered and displayed in the Inbox Review form.

## What Changed

### Database Migration
- `add_time_format_to_inbox_review_fields`: added a `time_format` column to
  `inbox_review_fields` (`text`, `NOT NULL`, default `'12h'`, CHECK in
  `'12h' | '24h'`). Existing timestamp fields keep 12-hour behavior by default.

### TypeScript Type
- Added `timeFormat: '12h' | '24h'` to the `InboxReviewField` interface.

### Review Setup Service (`reviewSetupService.ts`)
- `createField` inserts `time_format` (defaults to `'12h'`).
- `updateField` maps `timeFormat` to `time_format`.
- Template export and import (createField) carry `timeFormat` through.
- `mapField` reads `time_format` back into `timeFormat`.

### Setup Page — Review Field Groups Manager
- Added a `timeFormat` value to the field form state.
- When the field type is "Timestamp", the Edit Field panel now shows a
  "Time Format" custom dropdown with "12-hour (AM/PM)" and "24-hour" options.
  The dropdown is hidden for all other field types.

### Time Picker (`common/TimePicker.tsx`)
- Added an optional `use24Hour` prop.
- 24-hour mode lists hours 0–23, hides the AM/PM column, and formats/parses
  times as `HH:mm` (e.g. `15:45`).
- 12-hour mode is unchanged (`h:mm AM/PM`, e.g. `3:45 PM`).

### Inbox Review Form (`InboxReviewFormView.tsx`)
- Both the full form and the compact array/grid timestamp renders pass
  `use24Hour={field.timeFormat === '24h'}` to the time picker.

## Behavior
- Admins pick the time format per Timestamp field in the Edit Field panel.
- The Inbox Review form's time picker then follows that format.
- Existing saved values are left untouched; the format only affects new entry
  and display going forward.
