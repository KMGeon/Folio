# Diff View Mode Toggle Design

## Context

Folio's review diff UI currently renders a single unified diff table through
`apps/web/src/components/review/diff-viewer.tsx`. The same component is used for
chapter drill-in review and file-scoped review. Users need a second option that
shows old and new lines side by side, while preserving the existing unified view.

## Goals

- Add a `Unified / Split` view-mode toggle inside `DiffViewer`.
- Keep `Unified` as the default so the current behavior remains unchanged.
- Render split diff rows as old/deleted content on the left and new/added
  content on the right.
- Preserve inline review comment behavior in both modes.
- Reuse existing design tokens and dense dark review styling.

## Non-Goals

- Do not change backend diff payloads.
- Do not change inline comment target semantics or API calls.
- Do not persist the selected view mode across page reloads.
- Do not add a full visual regression or browser test suite in this pass.

## UI Behavior

`DiffViewer` owns a local state:

```ts
type DiffViewMode = "unified" | "split";
```

The file header shows a compact segmented control on the right:

- `Unified`
- `Split`

The control uses existing border, card, muted, foreground, and primary tokens.
It remains visible for both normal chapter diff and compact file-scoped diff.

## Unified Mode

Unified mode keeps the current rendering path. Existing line numbers, signs,
syntax highlighting, comment buttons, active editor rows, and created-comment
rows remain unchanged.

## Split Mode

Split mode derives rows from `chapter.diffLines` in the frontend only:

- `del` lines render in the old side.
- `add` lines render in the new side.
- `ctx` lines render on both sides.
- Consecutive `del` lines followed by consecutive `add` lines pair by index so
  changed blocks line up side by side.
- Unpaired deletions or additions leave the opposite side blank.

Each rendered old/new cell keeps the original `ReviewDiffLine`. Comment buttons
call the existing `commentTargetForLine(line)` helper, so deletion comments still
target `LEFT` old line numbers and addition/context comments still target `RIGHT`
new line numbers.

The split table uses horizontal overflow on small screens rather than stacking,
so old/new columns stay comparable.

## Component Boundaries

Keep the change scoped to `DiffViewer` and nearby tests:

- Add split-row derivation helpers inside `diff-viewer.tsx` unless the file grows
  close to lint limits.
- Reuse `InlineCommentEditor` for both modes.
- Avoid duplicating submit logic. Both modes should use the same `submitComment`
  path and `activeLine` state shape.

## Testing

Add lightweight source-level tests for `DiffViewer` because this project does not
currently have React DOM rendering tests for this component. The tests should
check that:

- `DiffViewer` defines `DiffViewMode`.
- the `Unified` and `Split` labels are present;
- split rendering uses a helper that preserves original `ReviewDiffLine` values;
- `commentTargetForLine` remains the comment-target path.

Run these verification commands:

```bash
pnpm --filter @folio/web test -- diff-viewer
pnpm --filter @folio/web typecheck
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Risks

- Pairing deleted and added lines is a visual heuristic. It should not alter line
  target data or backend payloads.
- Split mode adds table complexity to a file that already owns comments and
  syntax highlighting. If lint line limits are approached, extract only pure
  split-row helpers into a concrete file such as `split-diff-rows.ts`.
