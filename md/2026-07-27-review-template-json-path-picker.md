# 2026-07-27 — Inbox Review Template JSON Path Picker

## Summary

Added a sample JSON import feature to inbox review templates and a `{ }` path picker button next to the JSON Path field when adding/editing fields in field groups.

## What Changed

### Database

- `inbox_review_templates.sample_json` — new nullable text column. Stores a sample JSON payload used by the path picker UI.

### Review Template Setup (Admin)

- New "Sample JSON" button appears in the template toolbar (alongside "Copy from OE" and "Export").
- Clicking it opens a modal where you can paste a sample JSON extraction output.
- The JSON is validated before saving. You can also clear a previously saved sample.

### Add Field / Edit Field Form

- A `{ }` button now appears next to the JSON Path input field.
- When a sample JSON has been imported, clicking the button opens a dropdown showing all available dot-notation paths (e.g. `shipper.name`, `lineItems[0].description`).
- Each path shows its type (string, number, array, etc.) and a preview of the value.
- A search box at the top of the picker lets you filter paths.
- Clicking a path fills the JSON Path input automatically.
- If no sample JSON has been imported yet, the button is grayed out with a tooltip explaining to import a sample first.

### Service Layer

- `updateTemplate` now supports the `sampleJson` field.
- Template mapper includes `sampleJson` in the returned interface.

### TypeScript Types

- `InboxReviewTemplate` — added `sampleJson: string | null`.

## How It Works

1. Open a review template in the Review Setup admin.
2. Click "Sample JSON" and paste a real extraction output (the JSON that comes back after processing a document).
3. Save it.
4. When adding or editing fields in field groups, click the `{ }` button next to the JSON Path input.
5. A searchable dropdown appears with all paths from the sample — click one to fill the field.
