# 2026-08-14 — Fix: `chk_function_has_owner` Constraint Blocks Extraction Type Import

## Problem
When importing an extraction type that includes field mapping functions, the import fails with:

```
new row for relation 'field_mapping_functions' violates check constraint 'chk_function_has_owner'
```

## Root Cause
The `field_mapping_functions` table has a check constraint that requires at least one "owner" column to be set:

```sql
CHECK (
  extraction_type_id IS NOT NULL
  OR workflow_v2_node_id IS NOT NULL
  OR flow_node_id IS NOT NULL
  OR execute_button_id IS NOT NULL
)
```

During extraction type import, the code inserts the functions **before** the new extraction type row exists, so `extraction_type_id` cannot be set at insert time. All four owner columns are NULL, which violates the constraint.

The extraction type is created afterward, and then a separate UPDATE assigns `extraction_type_id` to the functions — but the INSERT never gets that far.

Workflow V2 and Execute Button imports do **not** have this problem because they insert functions with their owner ID (`workflow_v2_node_id` or `flow_node_id`) already set in the same INSERT statement.

## SQL Fix

Run the following SQL on any Parse-It instance that has this constraint. It replaces the strict constraint with a **deferrable** version that is checked at the end of each transaction instead of on every individual INSERT. This allows the import flow to insert the function row first and link the owner afterward, as long as both happen within the same transaction.

```sql
-- Step 1: Drop the existing non-deferrable constraint
ALTER TABLE field_mapping_functions
  DROP CONSTRAINT IF EXISTS chk_function_has_owner;

-- Step 2: Re-add it as DEFERRABLE INITIALLY DEFERRED
-- This means the check runs at COMMIT time, not at INSERT time,
-- giving the import code time to create the extraction type
-- and then UPDATE the function row with the owner ID.
ALTER TABLE field_mapping_functions
  ADD CONSTRAINT chk_function_has_owner
  CHECK (
    extraction_type_id IS NOT NULL
    OR workflow_v2_node_id IS NOT NULL
    OR flow_node_id IS NOT NULL
    OR execute_button_id IS NOT NULL
  )
  NOT VALID;

-- NOTE: PostgreSQL does not support DEFERRABLE on CHECK constraints.
-- Using NOT VALID means the constraint will validate new rows going forward
-- but will not block the INSERT when the app code sets the owner in a
-- follow-up UPDATE within the same request.
--
-- However, NOT VALID CHECK constraints still enforce on INSERT/UPDATE.
-- The true fix is in the application code (see below).
-- 
-- To unblock imports immediately, DROP the constraint:
```

### Option A — Drop the constraint entirely (quick unblock)
```sql
ALTER TABLE field_mapping_functions
  DROP CONSTRAINT IF EXISTS chk_function_has_owner;
```
This removes the guard entirely. Functions can exist without an owner until the app code is updated to always set one.

### Option B — Keep the constraint, fix the app code (recommended)
Keep the constraint in place. The application import logic should be reordered so that:

1. The new extraction type row is created **first** (INSERT into `extraction_types`)
2. Functions are inserted **with** `extraction_type_id` set to the new type's ID

This matches how the Workflow V2 and Execute Button importers already work.

The current problematic flow is:
```
INSERT function (no owner)  →  fails constraint
INSERT extraction_type      →  never reached
UPDATE function SET owner   →  never reached
```

The corrected flow should be:
```
INSERT extraction_type               →  get new type ID
INSERT function (owner = new type)   →  passes constraint
```

## Recommended Action
1. **Immediate unblock:** Run Option A (drop the constraint) on the affected instance so imports work now.
2. **Permanent fix:** Update the import code to create the extraction type before inserting its functions, then re-add the constraint.

## Files Involved (for the app code fix)
- `src/services/typeService.ts` — `importExtractionType()` function (lines ~863–1022)
