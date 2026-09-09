# 2026-08-06 — Execute Flows: Mobile App Visibility

## Summary
Added the ability to flag individual Execute Flows to appear in the Parse-It
mobile app, and made those flows openable through the existing shareable
`/execute/<slug>` link so the mobile app can run them in an in-app WebView
(no external browser, no native re-build of the flow engine). Also produced a
detailed integration spec for the mobile app team.

## Changes

### Database
- Added `visible_in_mobile` (boolean, default `false`) to the `execute_buttons`
  table, with a partial index for active, mobile-visible flows.
- No RLS changes; existing read access on `execute_buttons` still applies.

### Execute Setup (`src/components/settings/ExecuteSetupSettings.tsx`)
- Added a **"Show in Mobile App"** toggle to each Execute Flow's settings. It is
  an independent option, separate from the QR-code toggle.
- When "Show in Mobile App" is enabled, a shareable link (`qr_code_slug`) is now
  automatically created even if the QR-code option is off. Turning both options
  off clears the link.
- Uses the existing pencil edit icons and the same checkbox toggle style already
  used for the QR option (no new dropdowns or date pickers introduced).

### Public flow page (`src/components/PublicExecutePage.tsx`)
- The `/execute/<slug>` page now opens a flow when EITHER the QR-code option OR
  the mobile-visibility option is enabled (previously it required the QR-code
  option specifically).

### Documentation
- New mobile integration spec: `md/2026-08-06-mobile-execute-flows-integration-spec.md`
  explains how the mobile app lists mobile-flagged flows after login and opens
  each one inside an in-app WebView using the same experience a QR scan provides.

## Notes
- Existing flows remain hidden from the mobile app until an admin turns on
  "Show in Mobile App".
- The mobile team should render `/execute/<slug>` in an embedded WebView rather
  than rebuilding the flow engine natively (see the integration spec).
