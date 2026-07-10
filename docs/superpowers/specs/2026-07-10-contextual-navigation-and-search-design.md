# Contextual Navigation and Search Design

## Goal

Restore the compact global icon rail as Folio's default navigation, show the
existing settings sidebar only on settings routes, and open a centered search
modal from the rail's search action.

## Navigation behavior

- Every authenticated route begins with the permanent `w-12` global icon rail.
- The dashboard icon links to `/dashboard`; it does not expand a global menu.
- The settings icon links to `/settings/preferences`. On settings routes,
  `SettingsShell` continues to render its labeled settings sidebar beside the
  global rail.
- Do not render a desktop-wide global drawer or labeled global sidebar. Remove
  the recently added desktop-only presentation so route content keeps the
  compact rail layout.
- Retain the compact account-triggered drawer for the global navigation menu,
  including its Escape, outside-click, and route-change dismissal behavior.

## Search behavior

- Clicking the global rail's search icon opens a centered modal search surface
  over a dimmed page, matching the interaction shown in the reference image.
- The modal autofocuses its query input, loads PR results lazily, and includes
  static destinations plus open pull requests.
- Escape, an outside click, and choosing a result close the modal. Choosing a
  result clears the query and navigates to its route.
- Search is owned by `AppSearch`; the app header triggers the same modal rather
  than maintaining a second inline dropdown presentation.

## Component boundaries

- `GlobalNavigationRail` owns only the compact global rail, drawer, and search
  event trigger.
- `SettingsShell` remains the only owner of settings-specific navigation.
- `AppSearch` owns search modal state, result loading/filtering, focus, and
  dismissal. It listens for the existing `folio:focus-search` event from the
  rail and header trigger.

## Accessibility and testing

- Keep meaningful labels and active `aria-current` values on global links.
- The modal input receives focus when opened; its dialog is labeled and closes
  without requiring a mouse.
- Tests assert the global rail stays compact at desktop, the settings route
  remains responsible for labeled settings navigation, and the search component
  exposes modal behavior rather than an inline result dropdown.

## Scope

No routes, authentication, search data sources, or settings destinations change.
The work is limited to the global rail, `AppSearch`, and their focused tests.
