# 2026-07-28 Inbox Review Full Screen Layout

## Problem

When opening a record from the Inbox list, the review page was rendered inside the standard app layout (sidebar + header), giving it limited viewport space. The Imaging viewer, by contrast, opens full-screen without the layout wrapper, allowing the user to see much more data.

## Fix

1. **AppRouter.tsx** — Moved the `/inbox/:id` route outside the `LayoutRouter` wrapper (alongside the `/imaging/view` route) so it renders independently at full viewport size. The route still uses `PrivateRoute` and `RoleBasedRoute` for access control.

2. **InboxReviewPage.tsx** — Changed the outer container from `h-[calc(100vh-64px)]` to `h-screen` since the page no longer sits below the layout header.

The page already has its own header bar with a back button, so navigation is unaffected.
