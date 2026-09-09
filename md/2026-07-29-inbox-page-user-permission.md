# 2026-07-29 — Inbox Page User Permission

## Summary
Added a new "Inbox Page" permission so admins can control which users see the Inbox in the sidebar.

## What Changed

### TypeScript Type
- Added `inboxPage: boolean` to the `UserPermissions` interface, alongside the existing page-access permissions (extractPage, transformPage, executePage).

### User Management Settings
- Added `{ key: 'inboxPage', label: 'Inbox Page', icon: Inbox, description: 'Access the Inbox page' }` to the "Pages" permission category.
- This makes the toggle appear in both the "Create User" and "Edit Permissions" modals.

### Layout Navigation
- Added a permission check that hides the Inbox sidebar link when `user.permissions.inboxPage` is falsy, matching the pattern used for Extract, Transform, and Execute pages.

## Behavior
- Existing users who have never had this permission set will not see the Inbox page until an admin enables it for them.
- Admin users bypass all permission checks and are unaffected.
- No database migration is needed — permissions are stored as a JSON object, so the new key is automatically supported.
