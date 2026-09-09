# 2026-07-28 Inbox Review Changes Button Form View Highlighting

## Problem

The "Changes" button in the Inbox Review page toggled a diff view state, but this state was never passed to the Form view. Only the Fields (raw key-value) view responded to the button — the Form view did nothing visible.

## Fix

### 1. InboxReviewFormView — Added `changedFields` and `showChanges` props

- `GroupCard` and `ArrayGroupCard` now accept and use these props.
- In the standard group layout, each field cell gets an amber ring and background highlight when its `jsonPath` is in the changed set.
- In the array (table) layout, individual table cells are highlighted when the resolved field path is in the changed set.

### 2. InboxReviewPage — Wired the existing state into the Form view

- `changedFields` (Set) and `showDiffView` (boolean) are now passed as props to `InboxReviewFormView`.
- Added a "No changes" green banner for the Form view when the Changes button is active but nothing has been modified (matching the Fields view behavior).

### Result

Clicking the "Changes" button now visually highlights all modified fields in the Form view with an amber ring/background, and shows a banner summarizing how many fields changed or confirming no changes were made.
