# 2026-07-27 — Inbox Source Label and Bill Number Copy Button

## Summary

Two targeted improvements to the Inbox grid:

1. **Source column** — Simplified labels to only show "Upload" or "Email" (removed "Manual" and "System" labels). Items from the Email Monitor show "Email" with a mail icon; everything else shows "Upload" with an upload icon.

2. **Bill Number copy button** — Added a small copy icon beside the bill number badge in the Accepted filter view. Clicking it copies the bill number to the clipboard and briefly shows a green checkmark as confirmation.

## Changes

### Frontend (`InboxPage.tsx`)
- Updated `getSourceLabel` to return "Email" for email_monitoring, "Upload" for all other sources.
- Updated `getSourceIcon` to show only Mail (email) or Upload (everything else), removed the generic FileText fallback.
- Added a clipboard copy button next to the bill number value with visual feedback (checkmark on success).
- Added `copiedBillId` state to track which item's bill number was just copied.
- Added `Copy` and `Check` icon imports from lucide-react.
