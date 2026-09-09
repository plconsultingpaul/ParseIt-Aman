# 2026-07-28 Array Entry Builder Hardcoded Value Override Fix

## Problem

When an array entry field was configured as "Hardcoded" with a specific value (e.g. "O"), the AI extraction would sometimes return a different value for that field. The post-processing step (`injectArrayEntryHardcodedFields`) only applied the hardcoded value when the field was **missing** from the row — it did not correct wrong values the AI had already placed there.

## Fix

Removed the `if (!(field_name in row))` guard in both code paths (parent-level arrays and child arrays) so that hardcoded values are **always** written, unconditionally overwriting whatever the AI returned. This is safe because these fields are explicitly configured to always be a fixed value — the AI's opinion should never win.

## Affected File

- `src/services/submissionService.ts` — `injectArrayEntryHardcodedFields` function (two spots: one for top-level arrays, one for child arrays nested inside a parent array row).
