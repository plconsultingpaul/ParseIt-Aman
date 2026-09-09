# 2026-07-28 — Inbox Review Template JSON Path Picker Dropdown Fix

## Problem

The `{ }` JSON path picker dropdown in the "Add Field" / "Edit Field" modal was being clipped (cut off) by the modal's `overflow-y: auto` container, making paths below the modal boundary unreachable.

## Fix

Converted the JSON path picker from an absolutely-positioned dropdown inside the modal to a **portal-based fixed-position dropdown** rendered at the document body level (using `createPortal`). This escapes the modal's overflow clipping entirely.

### What Changed

**File:** `src/components/settings/ReviewFieldGroupsManager.tsx`

1. Added `createPortal` import from `react-dom` and `useCallback`.
2. Added a `ref` on the picker button (`jsonPathBtnRef`) to calculate its screen position.
3. Added `pickerPos` state and `updatePickerPosition` callback that measures space below/above the button and positions the dropdown in whichever direction has more room.
4. The dropdown now renders via `createPortal(... , document.body)` with `position: fixed` and calculated coordinates, matching how the existing `CustomDropdown` component handles portal rendering.
5. Updated the click-outside handler to properly account for both the button ref and the picker ref so clicks inside either don't dismiss the picker.
6. Position updates on scroll and resize to stay anchored to the button.

### Additional Verifications

- Edit icons: confirmed all edit buttons in this file use the `Pencil` icon (already fixed in prior session).
- Date pickers: no date inputs exist in this component — N/A.
- Custom dropdowns: the path picker is a specialized searchable list with type badges and previews that doesn't fit the standard `CustomDropdown` interface. The portal pattern from `CustomDropdown` was reused for the rendering approach.
