# Inbox Step - Workflow Pause & Resume Documentation

## Overview

The Inbox system provides a **human-in-the-loop** capability within automated workflows. When a workflow reaches an Inbox step, execution **pauses** and creates a review item. A human reviewer can then **Accept** or **Reject** the item, and the workflow automatically **resumes** from where it left off, carrying the reviewer's decision forward as variables for subsequent steps.

---

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────┐     ┌───────────────────┐
│ Workflow Engine  │────>│ Inbox Step   │────>│  inbox_items (DB) │
│ (executor-v2)   │     │ Throws Pause │     │  status: pending  │
└─────────────────┘     └──────────────┘     └───────────────────┘
                                                       │
                              ┌─────────────────────────┘
                              ▼
                 ┌──────────────────────┐
                 │   Inbox Page (UI)    │
                 │  User clicks Accept  │
                 │  or Reject           │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ inbox-resolve        │
                 │ (Edge Function)      │
                 └──────────┬───────────┘
                            │ Calls workflow-executor-v2
                            │ with resumeFromInbox=true
                            ▼
                 ┌──────────────────────┐
                 │ resumeWorkflowFrom   │
                 │ Inbox (Orchestrator) │
                 │ Executes remaining   │
                 │ steps after inbox    │
                 └──────────────────────┘
```

---

## Database Schema

### Table: `inbox_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Unique identifier for the inbox item |
| `workflow_id` | uuid (FK -> workflows) | The workflow that created this item |
| `execution_id` | uuid (FK -> workflow_executions) | The paused execution |
| `step_id` | uuid (FK -> workflow_steps) | The inbox step that paused |
| `trading_partner_id` | uuid (nullable) | Associated trading partner |
| `company_id` | uuid (nullable) | Owning company |
| `status` | text | `pending`, `accepted`, or `rejected` |
| `document_data` | jsonb | Snapshot of document data at pause time |
| `document_sid` | text (nullable) | Extracted SID from X12 data |
| `title` | text | Human-readable title (supports variable templates) |
| `description` | text (nullable) | Additional context for reviewer |
| `properties` | jsonb | Reviewer responses filled on resolution |
| `resolved_by` | uuid (nullable, FK -> profiles) | User who resolved |
| `resolved_at` | timestamptz (nullable) | When resolved |
| `for_each_step_id` | uuid (nullable) | If inside a loop, the parent forEach step |
| `iteration_index` | integer (nullable) | Loop iteration index |
| `loop_iteration_context` | jsonb (nullable) | Full loop context for resumption |
| `created_at` | timestamptz | When item was created |

### Table: `inbox_properties`

Defines the configurable form fields that reviewers fill out when accepting/rejecting.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Unique identifier |
| `company_id` | uuid (FK -> companies) | Owning company |
| `key` | text | Property key name (used in workflow variables) |
| `label` | text | Display label shown to reviewer |
| `field_type` | text | Input type: `text`, `dropdown`, `textarea`, `number` |
| `options` | jsonb (nullable) | Dropdown options array `[{value, label}]` |
| `is_required` | boolean | Whether field must be filled before accept/reject |
| `sort_order` | integer | Display order |

### Columns Added to `workflow_executions`

| Column | Type | Description |
|--------|------|-------------|
| `paused_at_step_id` | uuid (nullable) | The step where execution paused |
| `paused_input_data` | jsonb (nullable) | Input data at pause time |
| `paused_step_responses` | jsonb (nullable) | All step responses up to the pause point |
| `paused_properties` | jsonb (nullable) | Workflow properties map at pause time |
| `paused_accumulated_properties` | jsonb (nullable) | Accumulated properties (set_properties accumulate mode) |

---

## Inbox Step Configuration (Workflow Designer)

When configuring an Inbox step in the workflow designer, the following options are available:

### Config Fields

| Field | Purpose |
|-------|---------|
| **Title Template** | Template for the inbox item title. Supports `{{variableName}}` substitution from prior step responses. Example: `Review {{StepName.field}}` |
| **Description Template** | Optional template for additional context shown to the reviewer. Also supports variable substitution. |

### Variables Available After Resolution

After a user accepts or rejects an inbox item, the following variables become available for downstream steps:

| Variable | Value |
|----------|-------|
| `{{InboxStepName.inbox_action}}` | `"accepted"` or `"rejected"` |
| `{{InboxStepName.inbox_item_id}}` | The UUID of the resolved inbox item |
| `{{InboxStepName.<propertyKey>}}` | Value of each reviewer property (by its `key` field from `inbox_properties`) |

---

## How the Inbox Step Executes (Pause Flow)

**File:** `supabase/functions/workflow-executor-v2/steps/inboxStep.ts`

### Step-by-step:

1. **Resolve templates** - The title and description templates are resolved using variable substitution from prior step responses.

2. **Extract document SID** - If the workflow has a transaction type with a `sid_field_path`, the step extracts the SID from X12 content (for display in the inbox).

3. **Collect document data** - Gathers the input data and any X12 content from prior steps as a snapshot.

4. **Serialize execution state** - Captures all step responses, properties, and accumulated properties into serializable form.

5. **Insert inbox_items record** - Creates a new row with status `pending`, including all document data and context.

6. **If inside a for-each loop:**
   - Stores `loop_iteration_context` with the full iteration state (current item, index, step responses)
   - Returns `{ skipRemainingLoopSteps: true }` - the loop continues to the next iteration without executing downstream steps for this iteration
   - Does NOT pause the entire workflow

7. **If standalone (not in a loop):**
   - Updates `workflow_executions` to status `awaiting_inbox`
   - Stores paused state: `paused_at_step_id`, `paused_input_data`, `paused_step_responses`, `paused_properties`, `paused_accumulated_properties`
   - **Throws `InboxPauseError`** which is caught by the orchestrator

8. **Orchestrator handles `InboxPauseError`** - Returns `{ status: "paused" }` instead of treating it as a failure.

---

## Inbox Page (UI)

**File:** `src/components/InboxPage.tsx`

### Layout

- **Left panel**: Collapsible list of inbox items with status filter tabs (Pending, Accepted, Rejected, All) and a search bar
- **Right panel**: Detail view for the selected item

### Detail View Contents

- **Header**: Title, description, status badge, timestamp
- **Context cards**: Workflow name, trading partner name
- **Tabs**:
  - **Details** - Document data (JSON), review properties form, accept/reject buttons
  - **X12** - Syntax-highlighted X12 viewer (only shown if X12 content exists)

### Accept/Reject Flow

1. User selects a pending item from the list
2. User fills in any required reviewer properties (configured in `inbox_properties`)
3. User clicks **Accept** or **Reject**
4. Frontend calls the `inbox-resolve` edge function with:
   ```json
   {
     "inbox_item_id": "<uuid>",
     "action": "accepted" | "rejected",
     "properties": { "<key>": "<value>", ... }
   }
   ```

---

## How Accepting/Rejecting Resumes the Workflow

**File:** `supabase/functions/inbox-resolve/index.ts`

### Step-by-step:

1. **Authenticate the user** - Validates JWT from the Authorization header.

2. **Validate the request** - Checks `inbox_item_id` exists, action is valid, item is still `pending`.

3. **Update the inbox item** - Sets `status`, `properties`, `resolved_by`, `resolved_at`.

4. **Look up the execution** - Fetches the `workflow_executions` record using `execution_id` from the inbox item.

5. **Call workflow-executor-v2** with a special resume payload:
   ```json
   {
     "resumeFromInbox": true,
     "executionId": "<execution-uuid>",
     "workflowId": "<workflow-uuid>",
     "inboxResolutionData": {
       "action": "accepted",
       "inbox_item_id": "<uuid>",
       "properties": { ... }
     }
   }
   ```

6. **If the inbox item was inside a loop**, adds:
   ```json
   {
     "resumeLoopIteration": true,
     "inboxItemId": "<uuid>"
   }
   ```

---

## How the Workflow Executor Resumes Execution

**File:** `supabase/functions/workflow-executor-v2/core/workflowOrchestrator.ts`

### Standalone Resume (`resumeWorkflowFromInbox`)

1. **Load execution record** - Fetches the paused execution with all its saved state.

2. **Load workflow and steps** - Fetches the full workflow definition, steps, edges, and parent relationships.

3. **Restore execution context** - Rebuilds the `ExecutionContext` from:
   - `paused_step_responses` (all step outputs collected before the pause)
   - `paused_properties` (workflow properties map)
   - `paused_accumulated_properties`
   - Previously completed step IDs (from `workflow_step_logs`)

4. **Inject inbox resolution as a step response** - Adds:
   ```typescript
   {
     stepName: "InboxStepName",
     response: {
       inbox_action: "accepted" | "rejected",
       inbox_item_id: "<uuid>",
       ...properties  // reviewer-filled values
     }
   }
   ```

5. **Update execution status** to `running`.

6. **Find child steps** - Uses edges (or legacy parent_step_id) to find all steps that come after the inbox step.

7. **Execute child steps** - Runs each downstream step with the inbox output data as input. The step execution chain follows normal workflow logic from that point (decisions, API calls, etc.).

8. **Finalize** - Marks execution as `completed` or `failed`, clears paused state columns, updates workflow last execution status.

### Loop Iteration Resume (`resumeLoopIterationFromInbox`)

Used when the inbox step is inside a for-each loop:

1. **Load inbox item** with its `loop_iteration_context`.
2. **Restore iteration context** - Rebuilds step responses, loop variables (current item, index, etc.).
3. **Inject inbox resolution** as a step response.
4. **Find steps after the inbox step** within the loop body.
5. **Execute remaining loop steps** for just that iteration.
6. **Check if all iterations are resolved** - If pending inbox items remain for this execution, stays paused. Otherwise marks complete.

---

## Decision Routing Based on Accept/Reject

A common pattern is to place a **Decision step** immediately after the Inbox step:

```
[Inbox Step] → [Decision Step] → [Accept Path]
                       ↓
              [Reject Path]
```

The Decision step can evaluate:
- **Condition**: `{{InboxStepName.inbox_action}}` equals `accepted`
- **True path**: Continue processing (API calls, file creation, etc.)
- **False path**: Log rejection, send notification, stop workflow

This allows the workflow to branch based on the reviewer's decision.

---

## Key Design Patterns for Implementation

### 1. Execution State Serialization

When pausing, the entire execution state is serialized to the database:
- All previous step outputs (responses, headers, mappings)
- All workflow properties
- The exact step where execution stopped

This allows the workflow to resume hours or days later with full context.

### 2. Error Handling via Custom Exception

The `InboxPauseError` is a specialized error class that signals a controlled pause, not a failure. The orchestrator catches this specifically and returns `status: "paused"` instead of `status: "failed"`.

### 3. Edge Function as Resume Trigger

The `inbox-resolve` edge function acts as the bridge between the UI action and the workflow engine. It:
- Handles authentication
- Updates the inbox record
- Fires the workflow executor with the resume payload
- Returns the execution result to the UI

### 4. Loop-Aware Inbox

When an inbox step is inside a for-each loop:
- Each iteration creates its own inbox item
- Each iteration can be resolved independently
- The loop iteration context (current item, index, step responses at that point) is stored per inbox item
- Resolution resumes only that iteration's remaining steps

---

## Summary of Files Involved

| File | Role |
|------|------|
| `src/components/InboxPage.tsx` | UI for viewing and resolving inbox items |
| `src/components/step-config/InboxConfig.tsx` | Workflow designer config panel for the inbox step |
| `src/components/InboxSettings.tsx` | Admin UI for configuring reviewer properties |
| `supabase/functions/inbox-resolve/index.ts` | Edge function that handles accept/reject and triggers resume |
| `supabase/functions/workflow-executor-v2/steps/inboxStep.ts` | Step execution logic (creates item, pauses workflow) |
| `supabase/functions/workflow-executor-v2/core/workflowOrchestrator.ts` | Contains `resumeWorkflowFromInbox` and `resumeLoopIterationFromInbox` |
| `supabase/functions/workflow-executor-v2/index.ts` | Entry point that routes `resumeFromInbox` requests |
| `supabase/migrations/20260602170330_create_inbox_tables.sql` | Database schema for inbox tables |

---

## Implementation Checklist (For Another Application)

To replicate this pattern in another ReactFlow-based workflow application:

1. **Database tables**: Create `inbox_items` (tracks paused items) and `inbox_properties` (configurable reviewer fields)

2. **Execution state columns**: Add `paused_at_step_id`, `paused_input_data`, `paused_step_responses`, `paused_properties` to your executions table

3. **Execution status**: Add `awaiting_inbox` as a valid execution status

4. **Inbox step executor**: When reached, serialize full context to DB, set execution status to `awaiting_inbox`, throw a pause signal

5. **Inbox UI page**: List pending items, show document data, provide Accept/Reject buttons with optional form fields

6. **Resolution endpoint**: Update inbox item status, then call your workflow engine with a resume payload containing the action and properties

7. **Resume logic in workflow engine**: Restore execution context from DB, inject inbox resolution as a step response, find and execute child steps from the pause point onward

8. **Decision routing**: Allow subsequent Decision steps to branch on `inbox_action` value (`accepted`/`rejected`)

9. **Loop support** (optional): Store per-iteration context on the inbox item so individual loop iterations can be resumed independently
