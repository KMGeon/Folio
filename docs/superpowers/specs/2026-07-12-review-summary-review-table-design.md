# Review summary and chapter table

## Goal

Replace the overview page's independently stacked summary and review columns with
the approved A layout: a shared, two-column table surface. A reviewer can read
why the PR changed in the left cell and move directly to the associated chapter
review card in the right cell.

## Structure

- Add a focused overview component that owns the `변경 요약` and `리뷰` column
  headings and the paired rows beneath them.
- Build the summary side from the existing prologue fields: the plain summary,
  intent/outcome, key changes, and review focus. Do not alter the API payload.
- Pair each summary section with the same-ordinal chapter card. This keeps the
  visual rhythm from the approved mock without inventing a backend relationship.
  Any unmatched chapter renders with a compact summary-side continuation label;
  any unmatched summary section renders an empty-state review cell.
- Reuse the existing chapter card details, progress chips, and `onSelect`
  behavior so selecting a right-side card still opens the in-place diff review.
- Keep the description and comments prologue tabs outside the table; the table
  appears only while the summary tab is active.

## Responsive and visual behavior

- At `lg` and above, render a hairline-bordered two-column grid with a shared
  header and row dividers. Each row takes the height of its taller cell.
- Below `lg`, stack each pair with explicit `변경 요약` and `리뷰` labels so the
  relationship remains understandable without horizontal scrolling.
- Use existing Folio tokens and review primitives only: card/background,
  border, muted text, primary green, and existing risk/progress chips. The
  table should be dense and border-led, with no new color values or shadows.

## Error handling and accessibility

- Preserve existing prologue fallbacks when individual fields are absent.
- Preserve the no-prologue route by showing the existing description/comments
  tabs; do not render an empty comparison shell.
- Use semantic section headings and accessible card buttons/links. Responsive
  labels are visually present rather than relying on color or position alone.

## Verification

- Add unit coverage for pairing and unmatched-row behavior.
- Update overview source tests to assert the shared table component and the
  responsive two-column-to-stacked layout.
- Run the relevant web tests, then repository lint, typecheck, test, and build
  before handoff.
