# 2026-08-14 — Track & Trace Document Config: Custom Dropdowns

## Summary

Replaced three native browser dropdowns in the "Add Document Configuration" modal with the project's `CustomDropdown` component for visual consistency.

---

## Changes

### Native `<select>` Replaced with `CustomDropdown`

1. **Authentication dropdown** — the auth config picker in the Synergize vendor section
2. **Value Type dropdown** — the "Variable (from shipment)" / "Static Value" picker on each filter row
3. **Variable Name dropdown** — the variable selector that appears when a filter's value type is set to "Variable"

---

## Files Changed

- `src/components/settings/TrackTraceTemplatesSettings.tsx` — Added `CustomDropdown` import, replaced 3 native selects

## Backward Compatibility

- All changes are visual/UI only. No data model or backend changes.
