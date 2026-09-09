# 2026-07-30 — Inbox Auto Refresh

## Summary
Added an auto-refresh option to the Inbox page so the list can update on a chosen interval without manual clicks. The selected interval is remembered between visits.

## What Changed

### Inbox Header
- Added an auto-refresh dropdown (using the shared `CustomDropdown` component) next to the existing Refresh button.
- Options: Off, 1 min, 2 min, 5 min, 10 min, 15 min, 30 min.
- Added a "Last: HH:MM" timestamp showing when the data was most recently refreshed (hidden on very small screens).

### Behavior
- When an interval is selected, a timer re-runs the existing inbox load on that schedule, reusing the current status filter and search, and the Refresh icon spins during each refresh.
- Selecting "Off" stops the timer.
- The chosen interval is saved to the browser's local storage under `inboxAutoRefreshInterval` and restored when the page loads, so each user's last setting is remembered per device.
- The timer is cleaned up when leaving the page or changing the interval.

## Notes
- This is a per-device UI preference, stored in local storage to match how the app already remembers preferences like dark mode. No database changes were needed.
