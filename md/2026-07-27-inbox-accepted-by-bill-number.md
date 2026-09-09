# 2026-07-27 — Inbox Accepted By and Bill Number Columns

## Summary

Added two new fields to the Inbox grid that are visible when filtering by "Accepted" status:

1. **Accepted By** — Shows the name of the user who accepted the inbox item.
2. **Bill Number** — Shows the order/bill number returned by the API after the workflow resumed.

## Changes

### Database
- Added `bill_number` (text, nullable) column to `inbox_items` table.

### Edge Function (`inbox-resolve`)
- After a successful accept and workflow resume, the function now extracts the bill number from the workflow processor's API response (`lastApiResponse`).
- Looks for bill number in three common response shapes: `billNumber`, `orders[0].billNumber`, or `data.billNumber`.
- Patches the `bill_number` field on the inbox item if found.

### Frontend (`InboxPage`)
- Loads a lightweight user map (id -> name/username) on mount.
- When the "Accepted" filter tab is active, two additional columns appear in the grid:
  - **Accepted By**: resolves `resolved_by` UUID to the user's display name.
  - **Bill Number**: shows the stored bill number in a styled badge.
- These columns are hidden on other filter tabs (Pending, Rejected, All) since they only apply to accepted items.
