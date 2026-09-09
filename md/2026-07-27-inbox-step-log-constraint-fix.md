# 2026-07-27 — Inbox Step Not Showing in Workflow Logs

## Problem

When the Workflow V2 Inbox Review step executed, items were correctly sent to the Inbox for review, but no step entry appeared in the Workflow Execution Logs. The log showed "0 steps" despite the workflow reaching "Running" status.

## Root Cause

The `workflow_v2_step_logs` table has a CHECK constraint on the `status` column that only allowed: `running`, `completed`, `failed`, `skipped`.

The Inbox Review step writes its step log with status `paused` (since it pauses the workflow for human review). The database rejected this value with a 400 error. The `createV2StepLog` helper function logged the error internally but did not throw, so the workflow continued without recording the step.

## Fix

Added `paused` to the allowed values in the `workflow_v2_step_logs_status_check` constraint:

- Dropped the existing constraint.
- Recreated it with the additional `paused` value.

No code changes were needed — the edge function already writes `paused` correctly; only the database was rejecting it.

## Diagnostic Logging

Temporary debug logging was added to identify the issue and has been fully removed after confirming the root cause.
