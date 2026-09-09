# 2026-07-27 — Inbox Step Paused Status Visibility

## Problem

When a workflow pauses at an Inbox Review step waiting for human approval, the Workflow Execution Logs still showed the status as "Running" instead of "Paused." This made it unclear whether a workflow was actively processing or waiting for user action.

## Root Cause

Two issues:

1. **Database constraint**: The `workflow_v2_execution_logs` table had a CHECK constraint on `status` that only allowed `pending`, `running`, `completed`, `failed`. The edge function was trying to update the status to `paused_at_inbox`, but the update was silently rejected (the `updateV2ExecutionLog` helper doesn't check the response status), leaving the row stuck at `running`.

2. **Frontend missing status**: The Workflow Execution Logs page had no handling for the `paused_at_inbox` status — no icon, no color, no filter option, and no display label.

## Fix

### Database
- Added `paused_at_inbox` to the allowed values in the `workflow_v2_execution_logs_status_check` constraint.

### Frontend (Workflow Execution Logs page)
- Added `paused_at_inbox` case to `getStatusIcon` — shows an amber pause icon.
- Added `paused_at_inbox` case to `getStatusColor` — amber badge styling.
- Added a "Paused" option to the status filter dropdown.
- Added `getStatusLabel` helper so `paused_at_inbox` displays as "Paused" instead of the raw database value.
