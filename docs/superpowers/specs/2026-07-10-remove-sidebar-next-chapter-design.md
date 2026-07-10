# Remove sidebar next-chapter control design

## Goal

Remove the redundant next-chapter control from the chapter sidebar.

## Design

- Keep chapter navigation exclusively in the review toolbar, where previous and
  next actions are already grouped with diff controls.
- Remove the sidebar's `ChevronRight` button, its `nextChapter` calculation,
  and its chapter-route link dependency.
- Keep the viewed toggle and chapter switcher in the sidebar header unchanged.
- Update the review UI source-contract test to prevent the sidebar control
  from being reintroduced.

## Validation

Run the focused review UI test, followed by lint, typecheck, test, and build
before updating the existing PR.
