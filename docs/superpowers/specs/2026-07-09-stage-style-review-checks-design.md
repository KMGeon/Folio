# Stage-Style Review Checks Design

## Context

Folio already decomposes a pull request into ordered review chapters and renders
chapter diffs. The current review UI has the broad shape of StageReview: a PR
overview, chapter list, diff viewer, file tree, and chapter viewed state.

The target experience is closer to StageReview's review workflow:

- Each changed file in the diff has its own viewed check and can collapse after
  it is marked viewed.
- Each chapter exposes concrete review questions in a right-side panel.
- Review questions can be checked independently and visually collapse once done.
- The header shows file-review progress such as `1/55 viewed`.

Folio already has the backend building blocks for part of this. The database has
`file_review_state`, `chapter_review_state`, and persisted chapter
`keyChanges`. The missing pieces are read-model exposure, API endpoints, and the
review UI behavior.

## Goals

- Render the review page in a Stage-like split review layout: diff files on the
  left, chapter context on the right.
- Add per-file viewed checks in diff file headers.
- Collapse a file diff when the file is marked viewed.
- Show changed-file progress in the Files tab label and review toolbar.
- Surface each chapter's `keyChanges` as "검토할 사항" in the right panel.
- Add per-user check state for each review question.
- Collapse or visually de-emphasize completed review questions.
- Keep manual GitHub inline comments working through the existing line-comment
  flow.

## Non-Goals

- Do not auto-submit GitHub review comments.
- Do not clone every StageReview control in the first pass.
- Do not redesign the dashboard or PR header beyond controls needed for this
  workflow.
- Do not treat checking a file as checking every review question.

## Recommended Approach

Implement file checks and review-question checks together.

File checks can reuse the existing `file_review_state` table and
`reviewStateRepo.markFileViewed` / `unmarkFileViewed`. Review-question checks
need a new per-user state keyed by chapter key-change id. The existing
`chapters.keyChanges` array should become part of the review read model.

This approach matches the two check surfaces visible in StageReview while keeping
Folio's existing decomposition and manual comment flow intact.

## AI Review Question Generation

StageReview's right panel depends on each chapter having useful review questions.
Folio already stores model-generated `keyChanges`, but the current prompt allows
empty arrays whenever the model decides there is no human judgment call. That is
too sparse for this workflow.

Update the decomposition prompt and tests so `keyChanges` becomes the source for
chapter review questions:

- For every reviewable implementation chapter, generate 1-3 `keyChanges`.
- Permit 0 `keyChanges` only for chapters that are clearly docs-only,
  generated-only, dependency-only, or "Other changes" catch-all buckets.
- Each `keyChange.content` must be a Korean question a reviewer can check off
  after inspecting the chapter.
- Each question must include at least one tight `lineRef` pointing to the
  strongest supporting diff line.
- Questions should focus on product behavior, correctness risk, concurrency,
  persistence, API contracts, security, performance, or test coverage.
- Do not create questions for formatting, naming preference, or issues that
  TypeScript, lint, or CI would deterministically catch.
- Keep question text short enough to fit in the right panel without becoming a
  paragraph.

The parser should remain tolerant: if the model returns no key changes for a
chapter, the UI renders the empty state instead of blocking the review. The
quality bar should be enforced by prompt tests and fixture expectations, not by
making review generation fail at runtime.

## Data Model

Extend the web-facing chapter and file shapes:

```ts
interface ReviewChapterFile {
  path: string;
  additions: number;
  deletions: number;
  viewed: boolean;
}

interface ReviewKeyChange {
  id: string;
  content: string;
  lineRefs: LineRef[];
  viewed: boolean;
}

interface ReviewChapter {
  index: number;
  title: string;
  summary: string;
  files: ReviewChapterFile[];
  diffLines: ReviewDiffLine[];
  keyChanges: ReviewKeyChange[];
  viewed: boolean;
}
```

Add a new database table for per-user review-question state:

- `key_change_review_state`
- `user_id`
- `chapter_id`
- `key_change_id`
- `viewed_at`
- unique key: `(user_id, chapter_id, key_change_id)`

Use a row's presence to mean "checked", matching the existing chapter/file
review-state tables.

## Backend API

Extend `ReviewReadFacade`:

- Read `filePaths` from `reviewStateRepo.viewedForRevision`.
- Mark each chapter file with `viewed`.
- Include `row.keyChanges` as `ReviewKeyChange[]`.
- Mark each key change with per-user viewed state.

Add file viewed endpoint:

```http
PATCH /api/v1/pulls/:owner/:repo/:number/files/viewed
```

Body:

```json
{ "path": "order/build.gradle.kts", "viewed": true }
```

Return:

```json
{ "path": "order/build.gradle.kts", "viewed": true, "progress": { "viewed": 1, "total": 55 } }
```

Add review-question viewed endpoint:

```http
PATCH /api/v1/pulls/:owner/:repo/:number/chapters/:index/key-changes/:keyChangeId/viewed
```

Body:

```json
{ "viewed": true }
```

Return:

```json
{ "id": "chapter-4-kc-1", "viewed": true }
```

Both endpoints must use the existing session auth and repo access guard pattern.

## UI Layout

Keep Folio's dark, dense review UI and tokens. The chapter drill-in should become
the primary Stage-like review surface:

- Left side: a vertically stacked list of file diff panels for the active chapter.
- Right side: a sticky chapter panel with title, risk/size metadata, summary,
  "검토할 사항", and a file tree.
- Top controls: `Collapse all`, existing display button without new behavior,
  comment button, additions/deletions, and file progress.

Each file diff panel header should show:

- collapse/expand chevron
- file path
- additions/deletions
- viewed check button
- comment icon

When a file is marked viewed:

- the viewed check turns primary green
- the file panel collapses
- progress updates optimistically
- backend failure restores the previous state

## Review Question Behavior

Render `keyChanges` under "검토할 사항" in the right panel.

Each item should include:

- checkbox
- Korean question text
- optional hover/focus affordance for the first line reference

When checked:

- persist via the key-change viewed endpoint
- visually de-emphasize the item
- collapse it to a compact completed row
- allow unchecking to reopen it

Checking every review question should not automatically mark the chapter viewed
in the first implementation. Chapter viewed remains a separate coarse progress
state.

## File Filtering and Navigation

The right-side file tree should reflect the active chapter's files. Clicking a
file should scroll or focus the matching file diff panel on the left. Viewed file
state should be visible in the tree with the same check icon language used in
the diff header.

`Collapse all` should collapse all file panels in the active chapter. It should
not change viewed state.

## Error Handling

- If file viewed update fails, restore the previous file state and keep the panel
  open.
- If key-change viewed update fails, restore the previous item state.
- If a key-change id from the URL does not belong to the selected chapter, return
  404.
- If the review has no key changes, render a quiet empty state in the right
  panel instead of hiding the section.

## Testing

Add focused coverage for:

- Decomposition prompt/tool tests requiring reviewable chapters to produce
  useful `keyChanges` for the right-side review checklist.
- `ReviewReadFacade` returning file `viewed` state and chapter `keyChanges`.
- File viewed endpoint marking and unmarking a file.
- Key-change viewed endpoint marking and unmarking one question.
- `ReviewView` or extracted review components rendering file checks and progress.
- File viewed optimistic UI collapsing and rollback on failed request.
- Review-question checked state collapsing and rollback on failed request.

## Rollout Notes

This feature changes review workflow state and adds a database table. Treat the
database migration as an explicit implementation gate. The UI should remain fully
usable when a chapter has no generated key changes.
