# Chapter panel file tree design

## Goal

Keep the chapter diff unobstructed while making the right sidebar the complete
chapter context and navigation surface.

## Layout

- Remove the chapter overview card from `DiffViewer`, so the diff begins at the
  top of the main review pane.
- Retain the chapter header, title, change totals, and summary at the top of
  `ChapterPanel`.
- Keep review prompts and the all-chapters navigator in the sidebar.

## Chapter file navigation

- Replace the chapter panel's flat file list with the shared directory tree
  presentation used by the Files tab.
- A file row retains its status marker, viewed state, and addition/deletion
  totals. Selecting it scrolls the matching diff panel into view instead of
  changing the Files-tab selection.
- Directories remain independently collapsible.
- The chapter file search filters by complete path. A directory is rendered
  only if it contains a matching file; clearing the query restores the tree.

## Implementation boundaries

- Keep tree construction in `changed-file-tree-model.ts` and make the shared
  tree component accept the small interaction differences between the Files
  tab and chapter sidebar.
- Do not alter the Files tab's selected-file detail behavior.
- Add tests for path filtering/tree visibility and update component-source
  assertions that describe the panel layout.

## Validation

Run targeted web tests while developing, then `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and `pnpm build` before handoff.
