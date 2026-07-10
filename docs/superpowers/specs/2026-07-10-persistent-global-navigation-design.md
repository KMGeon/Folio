# Persistent Global Navigation Design

## Goal

Show Folio's labeled global navigation by default on desktop so a reviewer can
move between Dashboard, installation, and settings without first opening the
account-triggered drawer.

## Current behavior

Authenticated routes render a permanent `w-12` icon rail. Its adjacent `w-60`
drawer is absolutely positioned over route content and starts closed; the user
must click the avatar or brand trigger to reveal the labeled navigation.

## Proposed behavior

- At the desktop breakpoint (`lg` and above), render the labeled `w-60` global
  navigation as a persistent sidebar in normal layout flow.
- Do not require a click to access its links. The route content begins after the
  sidebar, preserving its available width without an overlay.
- Below `lg`, retain the compact `w-12` icon rail and its accessible, dismissible
  slide-out drawer. This keeps narrow viewports usable while retaining the
  existing Escape, outside-click, and navigation dismissal behavior.
- Keep the current navigation destinations, active-state styling, account name,
  and sign-out control. Reuse existing sidebar tokens and sizes; no new colors
  or visual language are introduced.

## Component boundaries

`GlobalNavigationRail` remains the sole owner of global navigation. It will
render desktop and compact navigation presentations from the existing item
definition, avoiding duplicated destinations or route-matching logic.

`AppLayout` remains unchanged as the shell owner: the persistent desktop sidebar
participates in its flex layout, while the compact rail remains self-contained.

## Accessibility and interaction

- Desktop navigation is ordinary visible link content and needs no disclosure
  state.
- The compact drawer continues to expose `aria-expanded`, `aria-controls`,
  Escape dismissal, outside-click dismissal, and route-change dismissal.
- Links preserve `aria-current="page"` for the active route.

## Verification

- Update component tests to assert that the desktop navigation is present in
  normal flow and the compact disclosure remains available at small widths.
- Run the focused web component test, then the repository's required lint,
  typecheck, test, and build commands before handoff.

## Scope

This change only affects authenticated global navigation presentation. It does
not change routes, authentication, settings' route-specific sidebar, or mobile
navigation destinations.
