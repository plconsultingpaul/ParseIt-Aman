# 2026-07-29 — DatePicker / TimePicker Edge Clipping Fix

## Summary
Fixed the date and time picker dropdowns getting cut off when their trigger field is near the right edge of the window.

## What Changed

### DatePicker
- Updated the positioning logic to clamp the dropdown's left position so it stays within the viewport, keeping an 8px margin from both edges.

### TimePicker
- Applied the same horizontal clamping fix as the DatePicker.

## Behavior
- Both pickers already handled vertical overflow (showing above vs. below the field).
- Now they also handle horizontal overflow, shifting the dropdown left when it would extend past the right edge of the window.
