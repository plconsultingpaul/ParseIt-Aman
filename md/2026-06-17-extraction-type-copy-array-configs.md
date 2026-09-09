# 2026-06-17: Fix Extraction Type Copy - Array Split Configs & Array Entry Builders

## Problem

When copying an Extraction Type, the Array Split Configuration and Array Entry Builder entries were not being duplicated to the new type. The copy operation only saved the base extraction type row and field mappings, but skipped the related array configuration tables.

## Root Cause

In `typeService.ts`, the `updateExtractionTypes()` function processes array splits and array entries only for types whose ID does NOT start with `temp-`. When a type is copied, it initially has a `temp-` prefixed ID, so the array config processing is skipped entirely. After the base row is inserted and the data is refreshed, the array configs are already lost from the in-memory state.

## Fix

Added explicit array config copying logic in `handleCopyType()` within `ExtractionTypesSettings.tsx`. After the new extraction type row is inserted and the real database ID is retrieved:

1. **Array Split Configs** - All split rules from the source type are inserted into `extraction_type_array_splits` with the new type's ID.
2. **Array Entry Configs** - All entry builder configs from the source type are inserted into `extraction_type_array_entries` with the new type's ID, and their child fields are inserted into `extraction_type_array_entry_fields` linked to each new entry.

## Files Changed

- `src/components/settings/ExtractionTypesSettings.tsx` - Added array split and array entry copy logic in `handleCopyType()` after the base type is saved. Also consolidated duplicate `savedType` lookups into a single query.
