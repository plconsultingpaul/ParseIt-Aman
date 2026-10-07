# 2026-10-07 - Fix Extraction Type Import ("chk_function_has_owner" error)

## Problem
Importing an Extraction Type in Type Setup > Extraction failed with:

> new row for relation "field_mapping_functions" violates check constraint "chk_function_has_owner"

Every row in `field_mapping_functions` must belong to an owner (extraction type, workflow node,
flow node, or execute button). The import inserted functions **before** the extraction type was
created, with no owner set, so the database rejected them.

## Additional bugs fixed in the same flow
1. **Wrong function linked to fields** - the remapping logic always picked the first function in the
   file, so with multiple functions every function-mapped field pointed at the same one.
2. **Functions borrowed from other types by name** - the import reused any existing function with the
   same name (from any type) instead of creating its own copy, and could error if the name existed more
   than once.

## Changes (src/services/typeService.ts only)
- `ExportedExtractionType.relatedData.functions` now includes an optional `original_id`.
- `exportExtractionType` writes each function's `original_id` so imports can remap fields precisely.
- `importExtractionType`:
  - Creates the extraction type first.
  - Remaining work moved into a new internal helper `importExtractionTypeRelatedData`, which:
    - Inserts each function as a new copy with `extraction_type_id` set to the new type.
    - Remaps field mapping `functionId`s using `original_id` -> new id. For older export files without
      `original_id`, remaps only when the file contains exactly one function.
    - Saves the remapped `field_mappings` onto the new type.
    - Inserts array split / array entry configs (unchanged logic).
  - If any related step fails, the newly created extraction type is deleted (cascades to its
    functions/entries) so no half-imported "(Imported)" type is left behind.

## Notes
- No database changes.
- No UI changes (no new dropdowns, edit buttons, or date pickers were needed).
- Export files created before this change still import; with multiple functions their function-mapped
  fields may need to be re-pointed manually, since those files don't record which function each field used.
