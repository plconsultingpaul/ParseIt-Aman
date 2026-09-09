# 2026-08-14 — Route Summary Config: Custom Dropdowns & Wider Modal

## Summary

Replaced all native browser dropdowns in the Route Summary Configuration modal with the project's custom dropdown component, and widened the modal so fields are no longer cut off when two groups share the same row.

---

## Changes

### 1. Native `<select>` Replaced with `CustomDropdown`

**Problem:** Five dropdowns in the Route Summary Configuration modal (Client Setup > Track & Trace > Page Sections > Route Summary) used the browser's native `<select>` element instead of the project's `CustomDropdown` component, making them visually inconsistent with the rest of the app.

**Fix:** Replaced all five native `<select>` elements with the `CustomDropdown` component:

1. **"Add New Group" Row picker** — the row selector in the "Add New Group" section
2. **Group row selector** — the small row dropdown next to each group name
3. **API Endpoint dropdown** — the endpoint picker inside each group's API section
4. **Auth Config dropdown** — the authentication selector inside each group's API section
5. **Field column selector** — the "Col 1/2/3/4" dropdown on each field row

All use `size="sm"` where appropriate to match the compact layout, and numeric values are converted to/from strings to match the `CustomDropdown` API.

### 2. Modal Widened to Prevent Field Clipping

**Problem:** When two groups were placed on the same row (side-by-side), the modal's `max-w-6xl` (1152px) cap left insufficient horizontal space for the field inputs (drag handle, label, API field, format dropdown, column dropdown, delete button), causing text to be cut off.

**Fix:** Changed the modal container from `max-w-6xl` to `max-w-7xl` (1280px), giving each side-by-side group card ~64px more horizontal space.

---

## Files Changed

- `src/components/settings/RouteSummaryConfigModal.tsx` — All changes in this single file

## Backward Compatibility

- All changes are visual/UI only. No data model or backend changes.
- The `CustomDropdown` component was already imported and used elsewhere in the project.
