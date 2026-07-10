# Stage-Style Sidebar Reset Design

## Goal

Match Stage's navigation structure: keep one compact global icon rail on normal
application screens, show a labeled secondary sidebar only inside settings, and
open search as a centered command modal.

This design supersedes the earlier persistent-global-navigation proposals.

## Dashboard and review routes

- Render only the compact global rail on the left.
- Remove the adjacent global menu panel containing `Folio`, `대시보드`, `설치`,
  `설정`, the username, and sign-out action.
- The rail remains visible at every viewport width and contains the account
  trigger, Dashboard, Settings, and Search actions.
- Dashboard navigates to `/dashboard`. Settings navigates to
  `/settings/preferences`. Search opens the command modal.
- The account trigger opens a small account/workspace popover; it does not open
  a full-height navigation drawer.

## Settings routes

- Keep the same compact global rail at the left edge.
- Replace the account trigger with a back-to-app action while settings are open.
- Render the settings-only 266px navigation beside the rail at `lg` and above.
  It contains user and workspace settings destinations and is owned by
  `SettingsShell`.
- Do not render the removed global menu between the rail and settings sidebar.

## Search

- The rail Search action opens the existing centered search modal.
- The modal remains available from any authenticated route and preserves focus
  trapping, focus restoration, Escape dismissal, backdrop dismissal, and result
  navigation.
- Search never expands or replaces the sidebar.

## Component ownership

- `GlobalNavigationRail` owns the compact rail and account popover only.
- `SettingsShell` owns the labeled settings navigation only.
- `AppSearch` owns the centered search modal only.
- `AppLayout` composes those route-specific surfaces without keeping a global
  labeled drawer in normal layout flow.

## Responsive behavior

- The compact rail stays visible on desktop and narrow screens.
- The settings navigation may stack or adapt at narrow widths using its current
  responsive behavior, but the global labeled drawer must not return.
- Main content begins immediately after the rail on dashboard/review routes and
  after the rail plus settings navigation on settings routes.

## Verification

- A regression test asserts the global labeled drawer and its `w-60` width are
  absent from `GlobalNavigationRail`.
- Route tests assert Dashboard and Settings remain available from the rail.
- Settings tests assert `SettingsShell` remains the sole labeled sidebar.
- Search tests continue to cover the centered modal and focus behavior.
- Run focused web tests, lint, typecheck, test, and build before handoff.

## Scope

No authentication, API, route destination, review content, or settings content
changes are included. Existing unrelated review-surface edits remain untouched.
