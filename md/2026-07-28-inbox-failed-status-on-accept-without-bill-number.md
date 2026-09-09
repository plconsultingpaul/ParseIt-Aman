# 2026-07-28 Inbox Failed Status on Accept Without Bill Number

## Problem

When a user accepted an Inbox item, the record was immediately marked as "Accepted" in the database BEFORE the workflow processor ran. If the processor failed or returned no bill number, the item still showed as Accepted even though it didn't actually succeed.

## Fix

### 1. Database Migration

- Added `'failed'` to the inbox_items `status` CHECK constraint (now allows: pending, accepted, rejected, failed).
- Added a `failure_reason` TEXT column to store why an accept attempt failed.

### 2. Edge Function (inbox-resolve)

Restructured the accept flow so the status is NOT set to `'accepted'` prematurely:

- On accept, edited data is saved but status remains unchanged.
- The workflow processor is called.
- If the processor returns an error OR no bill number, the item is marked `status = 'failed'` with a `failure_reason`.
- Only when the processor succeeds AND returns a bill number is the item marked `status = 'accepted'`.

### 3. Inbox List Page (InboxPage.tsx)

- Failed items now appear on the Pending tab (since they still need attention).
- A "Failed" badge (orange) is displayed in the status column for these items.
- A "Failure Reason" column shows on the Pending tab so users can see what went wrong.

### 4. Inbox Review Page (InboxReviewPage.tsx)

- Failed items can be opened and re-accepted (they are not treated as "resolved").
- A "Failed" banner displays at the top with the failure reason so the user knows what happened.
- The "Load Next" feature includes both pending and failed items.
