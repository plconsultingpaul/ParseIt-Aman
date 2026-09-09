# 2026-08-14 — Conditional Logic: Cross-Group Field Picker

## Problem
In the Order Entry template setup, the Conditional Logic popup (for visibility and required conditions) only showed fields from the **same group box** as the field being configured. This meant you could not create rules like "hide Delivery Date in Group 2 when Pickup is selected in Group 1."

## Root Cause
The `allFields` prop passed to the `FieldConditionsModal` was filtered with:
```
fields.filter(f => f.fieldGroupId === conditionsField.fieldGroupId && f.id !== conditionsField.id)
```
This restricted the available fields to only those sharing the same `fieldGroupId`.

## Fix
- **Removed the group filter** so all fields across all groups in the template are available for selection (only the field itself is excluded).
- **Added the group name as a prefix** to each field option in the dropdown (e.g. "Shipment Details → Pickup or Delivery") so users can easily identify which group a field belongs to.
- The `FieldConditionsModal` now receives the `allGroups` array to build the group-name lookup.

## Files Changed
- `src/components/settings/OrderEntryTemplatesSettings.tsx`
  - Line passing `allFields` now includes all template fields, not just same-group fields.
  - `FieldConditionsModal` accepts a new `allGroups` prop.
  - Field dropdown options now display as "Group Name → Field Label".

## Notes
- No database changes needed — the foreign key on `conditional_visibility_field_id` already allows referencing any field in the template.
- No runtime changes needed — the order entry form already evaluates conditions against the full `formData` object across all groups.
- The fix is admin-side only: it widens the field picker so cross-group conditions can be configured.
