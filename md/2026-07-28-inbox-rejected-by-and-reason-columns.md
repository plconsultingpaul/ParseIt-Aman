# 2026-07-28 Inbox Rejected Grid - Rejected By and Reason Columns

## Changes

### Added "Rejected By" and "Rejection Reason" columns to the Inbox grid

When viewing the Inbox with the Rejected filter active, two new columns now appear:

1. **Rejected By** — shows the name of the user who rejected the item (resolved from `resolved_by` via the user map).
2. **Rejection Reason** — shows the reason entered during rejection (from `resolution_notes`). Long reasons are truncated with a tooltip for the full text.

These columns only appear when the Rejected tab is selected, keeping the grid clean in other views.
