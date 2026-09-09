# 2026-07-28 — Inbox Reprocess Failed Items

## Summary
Added a "Retry" button on failed inbox items so they can be reprocessed through the workflow again.

## What Changed

### Frontend — Inbox Page
- Added an "Actions" column in the table when viewing the Pending filter.
- Failed items now show a "Retry" button with a refresh icon.
- Clicking Retry resets the item back to Pending status and re-triggers the workflow processor.
- A spinner shows while reprocessing is in progress.

### Service Layer — inboxService.ts
- Added `reprocessInboxItem(id)` function that:
  1. Resets the inbox item status to `pending` and clears the `failure_reason`.
  2. Calls the existing `resolveInboxItem` (accept) flow to re-run the workflow.

### Edge Function — inbox-resolve
- Updated the status guard to also allow items with `failed` status to be re-resolved (as a safety fallback in case the status reset hasn't propagated yet).

## Behavior
- Only items with "Failed" status show the Retry button.
- After clicking Retry, the item resets to Pending, the workflow re-runs, and if successful it moves to Accepted with a bill number. If it fails again, it returns to Failed with the new failure reason.
