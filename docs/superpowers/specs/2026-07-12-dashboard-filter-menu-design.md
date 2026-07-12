# Dashboard filter menu design

## Goal

Make the dashboard filter menu feel clear and deliberate: it must open beside the
filter control, avoid covering unrelated dashboard content, and let people choose
whether to apply or discard a set of changes.

## Interaction model

The filter control in the dashboard search row is the menu trigger and its visual
anchor. The menu opens below the trigger, aligned to its right edge. Its placement
must stay within the viewport on narrow screens.

Opening the menu creates a draft filter state from the currently applied filters.
The menu edits only that draft. Dashboard queries, board data, project summaries,
and cards remain unchanged until the person selects **Save changes**.

Closing the menu with **Cancel**, Escape, or a click outside it discards the draft
and preserves the applied filters. Saving promotes the draft to the applied filter
state, closes the menu, and uses the existing reload behavior. Focus returns to the
trigger after any close action.

## Menu composition

The menu uses the dark Folio card/popover surface and existing tokenized borders,
text, control sizes, and primary green. It is dense, with four sections:

1. A concise `Filters & ordering` header.
2. Ordering controls: sort field and direction, followed by the closed-review
   period and draft toggle.
3. Display-property chips, preserving the existing available properties and their
   selection semantics.
4. A footer with a quiet `Cancel` action and a token-primary `Save changes` action.

The menu trigger exposes its expanded state. The open menu handles Escape and
outside interaction without accidentally treating clicks inside selects, chips, or
actions as dismissal. Focus moves into the menu when opened and returns to the
trigger when closed.

## Component boundary

`DashboardSearchBar` owns the trigger element and provides a stable anchor.
`DashboardFilterPanel` is responsible for the positioned, dismissible menu and
its draft controls. `DashboardBoardClient` owns applied filter state and only
receives a new value when the panel saves. This prevents pending choices from
triggering fetches through existing effects.

The positioning behavior should be implemented with an existing accessible popover
primitive if the repository already has one; otherwise the focused menu should be
implemented with a small, dedicated anchored-menu component rather than a
page-relative absolute panel. No new color or typography tokens are needed.

## Verification

Automated coverage will verify:

- Opening anchors the menu to the filter trigger and exposes the correct expanded
  state.
- Editing a draft filter does not update the applied filters or fetch inputs.
- Save applies the complete draft exactly once and closes the menu.
- Cancel, Escape, and outside interaction discard a draft and restore focus to the
  filter trigger.
- Menu placement remains bounded in narrow viewports.

Manual QA will confirm the menu has no visual overlap with the dashboard header,
feels compact in the dark design system, and its controls remain readable while
the dashboard has a long completed-review list.
