# Independent review overview layout

## Goal

Remove the shared summary/chapter table introduced in PR #137. Restore an
independent two-column review overview so the summary's height is driven only
by PR context and the chapter list's height is driven only by review content.

## Layout

- At `lg` and above, restore the overview grid with the summary on the left
  and review controls/chapter cards on the right. The columns must be separate
  surfaces with a gap; they do not share table rows or cell heights.
- Restore the prior `ReviewSummary` presentation in the summary tab: plain
  summary, motivation, outcome/diagram, key changes, and review focus keep
  their existing visual hierarchy and fallback copy.
- Keep the existing right-side chapter cards, continue-review action, and
  activity tab. Selecting a chapter must continue opening the in-place diff.
- At narrow widths, retain the existing vertical stack order: summary first,
  then the review controls and cards.

## Dynamic behavior

- The left card renders directly from `Prologue`, so section presence and
  height follow the actual summary data rather than the number or height of
  review chapters.
- The right rail renders directly from `ReviewChapter[]`, including any
  number of chapters. No ordinal pairing or synthetic continuation rows are
  required.

## Constraints and verification

- Do not change API payloads or backend behavior.
- Reuse existing Folio dark-mode tokens and the previous summary/card
  components; introduce no new colors, shadows, or layout primitives.
- Remove now-unused table-only components and tests rather than leaving dead
  presentation paths.
- Add regression tests proving the independent overview grid, prior summary
  rendering, and chapter-card selection path; run focused web tests, web
  typecheck, then repository lint, typecheck, test, and build.
