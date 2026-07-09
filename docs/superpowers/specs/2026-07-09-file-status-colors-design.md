# File Status Colors Design

## Goal

Folio should distinguish added, modified, deleted, renamed, and moved files in the
review UI, matching the quick scan value of GitHub's changed-files list while
staying inside Folio's dense dark review surface.

The first implementation covers:

- The `Files` tab file tree.
- The selected file header in the `Files` tab.
- The changed-files list shown in chapter-oriented review surfaces.

## Non-Goals

- Add file-status filters.
- Change diff line colors or split/unified diff behavior.
- Change database schema or persisted review state.
- Show rename old paths in the UI.
- Rework layout beyond the minimum needed to add status indicators.

## Data Contract

The existing parser already produces canonical GitHub-style file status through
`@folio/types`:

- `added`
- `modified`
- `deleted`
- `renamed`
- `moved`

`WebChapterFile` and the frontend `ReviewChapterFile` type will add a `status`
field using that existing `FileStatus` union. `sliceChapterCode()` will preserve
the parsed file status when it converts raw diff hunks into web-facing chapter
code.

When a file appears in multiple hunk refs within a chapter, its additions and
deletions continue to aggregate exactly as they do now, while `status` remains
the parsed diff status for that path. When the frontend aggregates files across
chapters for the `Files` tab, it will keep the status for the path and continue
summing line counts.

This keeps the UI based on real GitHub diff metadata rather than guessing from
line counts. That matters because a modified file can contain only additions,
only deletions, or a large replacement, and rename/move status cannot be inferred
reliably from additions and deletions.

## UI Treatment

The UI will use compact status indicators rather than coloring whole rows. This
preserves the existing selected/hover states and keeps the file list dense.

Status presentation:

| Status | Visual role | Icon | Chip |
| --- | --- | --- | --- |
| `added` | green addition | `FilePlus2` | `A` |
| `modified` | neutral foreground/muted | `FilePenLine` | `M` |
| `deleted` | red deletion | `FileMinus2` | `D` |
| `renamed` | blue/link path change | `FileSymlink` | `R` |
| `moved` | blue/link path change | `FileSymlink` | `V` |

The implementation should reuse existing tokens:

- Additions use `text-diff-add-fg`.
- Deletions use `text-diff-del-fg`.
- Renamed and moved files use `text-syntax-link`.
- Modified files use existing foreground/muted text classes.
- Borders and chip backgrounds use existing `border`, `muted`, and alpha utility
  patterns already present in the review UI.

The file name should remain readable and mostly neutral. The icon color and
one-letter chip carry the status meaning. Existing additions/deletions counts
remain visible so reviewers can scan both the kind and size of the change.

## Component Scope

Primary files expected to change:

- `apps/backend/src/domain/review/review-read-model.ts`
- `apps/backend/src/domain/review/chapter-diff-slice.ts`
- `apps/web/src/lib/review-api.ts`
- `apps/web/src/components/review/changed-file-tree.tsx`
- `apps/web/src/components/review/review-view.tsx`
- `apps/web/src/components/review/chapter-panel.tsx`

If the aggregate file logic needs a focused test, move it out of
`review-view.tsx` into a small named module rather than adding a vague helper
file. Use a concrete name such as `changed-file-summary.ts`.

## Testing

Add or update focused tests:

- Backend: `chapter-diff-slice` preserves parsed file status in
  `ChapterCode.files`.
- Frontend: file-scoped chapter construction preserves `status`.
- Frontend, if aggregation is extracted: duplicated file paths aggregate line
  counts while preserving status.

Run the normal verification set before push:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Risks

Renames and moves depend on the parsed diff status in `@folio/diff`. If a raw
GitHub diff omits enough metadata for the parser to classify a path change, the
UI will show the parser's best status. The UI should not add inference on top of
that for this feature.

The `Files` tab currently dedupes by `path`. If future support displays old
paths for renamed files, aggregation may need to account for `oldPath`, but that
is outside this change.
