# 2026-07-28 Inbox Review Array Group Data Resolution Fix

## Problem

In the Inbox Review form display, array group columns (e.g. "Details") were not appearing in the same order as configured in the Form Layout Designer. The form was sorting columns by `fieldOrder` (a static value on the field record), while the Layout Designer saves visual position via `rowIndex` and `columnIndex` in the layouts table — without updating `fieldOrder`.

## Fix

In `InboxReviewFormView.tsx`, the `ArrayGroupCard` component now sorts its fields by layout position (`rowIndex`, then `columnIndex`) before rendering table headers and cell columns. Falls back to `fieldOrder` for any field that doesn't yet have a layout entry.

## Affected File

- `src/components/InboxReviewFormView.tsx` — `ArrayGroupCard` function: added `sortedFields` memo that sorts by layout row/column, and used it in both the `<th>` header loop and the `<td>` body loop.
