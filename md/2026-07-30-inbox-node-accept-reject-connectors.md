# 2026-07-30 — Inbox Node Accept / Reject Connectors

## Summary
The Inbox Review step in the workflow designer now has two output connectors — **Accept** (green) and **Reject** (red) — so each decision can lead down its own path, matching how the Condition step already branches into "Yes" / "No".

## What Changed

### Workflow Designer (visual)
- The Inbox Review node now shows two labeled output connectors: **Accept** and **Reject**, instead of a single output.
- Lines drawn from the Accept connector are labeled "Accept"; lines from the Reject connector are labeled "Reject".
- Each connector can be wired to a different next step by dragging a connection, exactly like the Condition node. No storage changes were needed — connections already remember which connector they leave from.

### Behavior when a user resolves an item
- **Accept**: the workflow resumes down the path wired to the **Accept** connector. The existing rule is unchanged — if the accepted item runs through and does not return a bill number, it is still marked as **Failed**.
- **Reject**: the workflow now resumes down the path wired to the **Reject** connector (previously Reject just stopped). The item is marked **Rejected** once that path finishes. If no Reject path is wired, it stops and is marked Rejected as before.

## Notes
- Older workflows should be updated so their Inbox node has both an Accept and a Reject path wired; the Accept and Reject connectors are matched by name.
- No database or schema changes were required — branch routing is entirely connection-based, keyed by the connector name.

## Files Touched
- `src/components/settings/workflow-v2/WorkflowV2FlowNodes.tsx` — two output handles (`accept` / `reject`) for the inbox node.
- `src/components/settings/workflow-v2/WorkflowV2FlowDesigner.tsx` — connection labels for the Accept / Reject handles.
- `supabase/functions/inbox-resolve/index.ts` — Accept follows the `accept` connector; Reject follows the `reject` connector and resumes the workflow; shared resume/next-node helpers.
