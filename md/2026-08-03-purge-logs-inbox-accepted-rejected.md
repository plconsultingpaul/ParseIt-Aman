# 2026-08-03 — Purge Logs: Inbox Accepted & Rejected Log Types

## Summary
Added Inbox logs to the **Logs → Purge Logs** screen. Accepted and Rejected
inbox items are exposed as two independent, separately selectable log types.

## Changes

### UI — `src/components/settings/PurgeLogsSettings.tsx`
- Added two entries to `LOG_TYPES`:
  - `inbox_accepted` — "Inbox Accepted Logs" (Accepted inbox review items)
  - `inbox_rejected` — "Inbox Rejected Logs" (Rejected inbox review items)
- No other UI logic changed. The purge result summary already keys off the log
  type id, so both new types report their deleted counts individually.

### Edge Function — `supabase/functions/purge-logs/index.ts`
- Replaced the `ALLOWED_TABLES` / `TABLE_DATE_COLUMN` / `CHILD_TABLES` maps with a
  single `LOG_TYPE_CONFIG` map keyed by log type id. Each entry declares its
  target `table`, `dateColumn`, an optional `status` filter, and an optional
  `child` cascade table.
- `inbox_accepted` and `inbox_rejected` both target the shared `inbox_items`
  table, filter on `resolved_at` for the retention cutoff, and apply a
  `status = 'accepted'` / `status = 'rejected'` filter respectively.
- The purge loop now applies the optional status filter on both the child-cascade
  lookup and the main delete, and returns deleted counts keyed by log type id.

## Notes
- Both new log types read from one table (`inbox_items`) but are purged
  independently via the `status` filter, so purging Accepted logs never touches
  Rejected logs and vice versa.
- Pending inbox items (`status = 'pending'`) are never purged.
