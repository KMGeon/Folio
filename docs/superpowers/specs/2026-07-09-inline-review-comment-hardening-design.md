# Inline Review Comment Hardening Design

## Context

Folio supports two GitHub comment flows:

- The automated chapter overview comment is an issue comment upserted with the
  hidden `<!-- folio:chapters -->` marker.
- The manual line comment flow creates a GitHub pull request review comment from
  the web diff UI, then stores a row in Folio's `comments` table.

The manual flow currently loses file identity after backend diff slicing. A
chapter can include hunks from multiple files, but `ReviewDiffLine` only carries
line number, kind, and text. The UI then infers the file from either the selected
file context or the first file in the chapter. That can send a valid-looking
comment request to the wrong file. The backend also validates only request shape,
not whether the requested `path + side + line` belongs to the chapter's latest
revision diff.

## Goals

- Preserve each rendered diff line's file path through the read model and web UI.
- Ensure the Files tab renders only the selected file's lines.
- Validate inline comment targets on the backend before writing to GitHub.
- Keep the existing GitHub API shape: `commit_id`, `path`, `side`, and `line`.
- Keep comments dense and chapter-review focused; do not redesign the UI.

## Non-Goals

- Do not implement full two-way GitHub review comment sync.
- Do not redesign the comments table schema beyond storing the existing line ref.
- Do not switch to pending review batches or user-to-server GitHub writes.
- Do not add GitHub API compensation deletion in this iteration.

## Design

### Diff Line Identity

Extend the review read model so every `WebDiffLine` includes:

- `path`: the file path from the parsed diff hunk.
- `oldLineNumber`: the old-side line number when available.
- `newLineNumber`: the new-side line number when available.

Keep the existing `n` field for UI display compatibility. For deletion lines,
`n` remains the old line number. For additions and context lines, `n` remains the
new line number.

### Frontend Comment Targeting

`DiffViewer` should derive the comment `path` from the active line instead of a
viewer-level fallback. The submitted `side` remains `LEFT` for deleted lines and
`RIGHT` for additions/context lines, which matches GitHub's documented split diff
semantics.

The Files tab should pass only lines whose `path` matches the selected file to
`DiffViewer`. The chapter drill-in may continue showing all chapter lines, since
each line now carries its own path.

### Backend Validation

Before calling GitHub, `ReviewCommentFacade.createInlineComment` should rebuild
the latest chapter code from `revision.rawDiff` and the selected chapter's
`hunkRefs`. It should accept a target only when the requested `path`, `side`, and
`line` match a rendered diff line in that chapter:

- `LEFT` matches a deletion line whose old line number equals `line`.
- `RIGHT` matches an addition or context line whose new line number equals `line`.

Invalid targets should be rejected before any GitHub write. The controller can
continue returning `404` for a `null` facade result in this iteration, preserving
the existing public response shape.

### Persistence and Failure Behavior

Keep the current order: create the GitHub review comment, then persist the Folio
comment row with `source: "folio"`. This means a DB failure after a GitHub
success can still leave an orphan GitHub comment. The implementation should add
test coverage that documents this behavior, but compensation deletion and
idempotency should remain a separate design because they require a clearer
external-write policy.

### Tests

Add focused coverage for:

- `sliceChapterCode` preserving `path`, old line numbers, and new line numbers.
- Files tab / `DiffViewer` path targeting behavior at the component logic level
  where feasible.
- `ReviewCommentFacade` rejecting a path/side/line not present in the selected
  chapter before calling GitHub.
- Existing happy path still creating GitHub review comments and storing DB rows.

## Risks

- `ReviewDiffLine` is a public web payload type; backend and frontend types must
  change together.
- Context lines are valid `RIGHT` targets per GitHub docs, but only when they are
  part of the PR diff. Backend validation must use the parsed hunk, not only a
  positive line number.
- The existing backend vitest command currently also exposes an unrelated
  `.env.example` key mismatch. Comment-specific verification may need targeted
  test commands plus a note about that pre-existing failure.
