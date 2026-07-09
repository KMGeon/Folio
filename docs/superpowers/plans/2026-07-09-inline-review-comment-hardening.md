# Inline Review Comment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Folio inline review comments target the exact rendered diff line and reject stale or mismatched comment targets before writing to GitHub.

**Architecture:** Preserve file and old/new line identity in the backend review read model, validate comment targets against the latest sliced chapter diff in the backend facade, and make the web UI derive comment path from each active line. The GitHub API request shape remains `commit_id`, `path`, `side`, and `line`.

**Tech Stack:** pnpm, TypeScript ESM, NestJS, Next.js App Router, Vitest, `@folio/diff`, `@folio/github`, Drizzle-backed `@folio/db`.

## Global Constraints

- Follow `docs/design-system.md` for all UI behavior; keep the dark-mode dense review UI.
- Use repo root as the working directory unless a package-specific command is required.
- Do not commit real `.env`, `.env.dev`, or `.env.prd` files.
- Do not add a `max-lines` disable; split focused files instead.
- Do not bypass hooks with `--no-verify`.
- Existing unrelated `.env.example` changes must not be reverted.
- Preserve the existing public POST route: `/api/v1/pulls/:owner/:repo/:number/comments`.
- Invalid inline targets should be rejected before any GitHub write.

---

## File Structure

- `apps/backend/src/domain/review/review-read-model.ts`: extend `WebDiffLine` with `path`, `oldLineNumber`, and `newLineNumber`.
- `apps/backend/src/domain/review/chapter-diff-slice.ts`: populate the added diff line identity fields.
- `apps/backend/src/domain/review/chapter-diff-slice.test.ts`: prove multi-file lines keep path and old/new numbers.
- `apps/backend/src/domain/review/comment-target.ts`: new focused domain function for validating a comment target against sliced chapter code.
- `apps/backend/src/domain/review/comment-target.test.ts`: prove valid/invalid target matching.
- `apps/backend/src/application/review/review-comment.facade.ts`: call target validation before GitHub writes.
- `apps/backend/src/application/review/review-comment.facade.test.ts`: cover rejection before GitHub call and current DB-after-GitHub behavior.
- `apps/web/src/lib/review-api.ts`: mirror the enriched `ReviewDiffLine` payload type.
- `apps/web/src/components/review/chapter-file-diff.ts`: new focused frontend function to produce a file-scoped chapter view for the Files tab.
- `apps/web/src/components/review/chapter-file-diff.test.ts`: prove selected file filtering preserves chapter metadata and drops other files' lines.
- `apps/web/src/components/review/diff-comment-target.ts`: new focused frontend function for mapping a rendered line to GitHub comment target fields.
- `apps/web/src/components/review/diff-comment-target.test.ts`: prove deletion/comment side and path mapping.
- `apps/web/src/components/review/diff-viewer.tsx`: use line-level path/side target rather than viewer fallback.
- `apps/web/src/components/review/review-view.tsx`: pass a file-scoped chapter to the Files tab `DiffViewer`.

---

## Task 1: Backend Diff Line Identity

dag:
  id: "backend-diff-identity"
  purpose: "Preserve file path and old/new line numbers on every backend-rendered diff line."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/backend/src/domain/review/review-read-model.ts"
      - "apps/backend/src/domain/review/chapter-diff-slice.ts"
      - "apps/backend/src/domain/review/chapter-diff-slice.test.ts"
    modules:
      - "@folio/backend"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- src/domain/review/chapter-diff-slice.test.ts"
      - "pnpm --filter @folio/backend typecheck"
    expected: "chapter-diff-slice tests pass; backend typecheck passes or reports only pre-existing unrelated issues."
  risk:
    collision: "medium"
    external_write: false
    database: false
    deployment: false
    notes: "This changes the ReviewPayload wire shape consumed by web code, so later frontend task depends on it."
  handoff_payload:
    include_spec_sections:
      - "Diff Line Identity"
      - "Tests"
    include_plan_sections:
      - "Task 1: Backend Diff Line Identity"

**Files:**
- Modify: `apps/backend/src/domain/review/review-read-model.ts`
- Modify: `apps/backend/src/domain/review/chapter-diff-slice.ts`
- Test: `apps/backend/src/domain/review/chapter-diff-slice.test.ts`

**Interfaces:**
- Consumes: `DiffLine.oldLineNumber`, `DiffLine.newLineNumber`, and parsed file path from `@folio/diff`.
- Produces: `WebDiffLine` with `{ path: string; n: number; kind: "add" | "del" | "ctx"; text: string; oldLineNumber?: number; newLineNumber?: number }`.

- [ ] **Step 1: Write the failing tests**

Replace the expected lines in `apps/backend/src/domain/review/chapter-diff-slice.test.ts` with enriched line objects and add a multi-file case:

```ts
const MULTI_FILE_DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 const z = 3;
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -10,3 +10,2 @@
 const keep = true;
-const remove = true;
 const done = true;
`;

it("preserves each rendered line's file path and old/new line numbers", () => {
  const code = sliceChapterCode(MULTI_FILE_DIFF, [
    { filePath: "a.ts", oldStart: 1 },
    { filePath: "b.ts", oldStart: 10 },
  ]);

  expect(code.diffLines).toEqual([
    {
      path: "a.ts",
      n: 1,
      kind: "ctx",
      text: "const x = 1;",
      oldLineNumber: 1,
      newLineNumber: 1,
    },
    {
      path: "a.ts",
      n: 2,
      kind: "add",
      text: "const y = 2;",
      newLineNumber: 2,
    },
    {
      path: "a.ts",
      n: 3,
      kind: "ctx",
      text: "const z = 3;",
      oldLineNumber: 2,
      newLineNumber: 3,
    },
    {
      path: "b.ts",
      n: 10,
      kind: "ctx",
      text: "const keep = true;",
      oldLineNumber: 10,
      newLineNumber: 10,
    },
    {
      path: "b.ts",
      n: 11,
      kind: "del",
      text: "const remove = true;",
      oldLineNumber: 11,
    },
    {
      path: "b.ts",
      n: 11,
      kind: "ctx",
      text: "const done = true;",
      oldLineNumber: 12,
      newLineNumber: 11,
    },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @folio/backend test -- src/domain/review/chapter-diff-slice.test.ts
```

Expected: FAIL because `WebDiffLine` lacks `path`, `oldLineNumber`, and `newLineNumber`.

- [ ] **Step 3: Extend the backend read model**

Update `apps/backend/src/domain/review/review-read-model.ts`:

```ts
/** Web-facing diff line: file identity plus display line data for comments. */
export interface WebDiffLine {
  path: string;
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
```

- [ ] **Step 4: Populate line identity from parsed hunks**

Update `apps/backend/src/domain/review/chapter-diff-slice.ts`:

```ts
function toWebLine(filePath: string, line: DiffLine): WebDiffLine {
  return {
    path: filePath,
    n: line.newLineNumber ?? line.oldLineNumber ?? 0,
    kind: lineKind(line),
    text: line.content,
    oldLineNumber: line.oldLineNumber,
    newLineNumber: line.newLineNumber,
  };
}
```

Then replace:

```ts
diffLines.push(toWebLine(line));
```

with:

```ts
diffLines.push(toWebLine(file.path, line));
```

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm --filter @folio/backend test -- src/domain/review/chapter-diff-slice.test.ts
pnpm --filter @folio/backend typecheck
```

Expected: test passes. Typecheck may expose frontend-independent backend type errors only if unrelated local state already had them; investigate before proceeding.

---

## Task 2: Backend Comment Target Validation

dag:
  id: "backend-target-validation"
  purpose: "Reject inline comment targets that are not present in the selected latest chapter diff before GitHub writes."
  deps: ["backend-diff-identity"]
  parallel_group: "wave-2"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/backend/src/domain/review/comment-target.ts"
      - "apps/backend/src/domain/review/comment-target.test.ts"
      - "apps/backend/src/application/review/review-comment.facade.ts"
      - "apps/backend/src/application/review/review-comment.facade.test.ts"
    modules:
      - "@folio/backend"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- src/domain/review/comment-target.test.ts src/application/review/review-comment.facade.test.ts"
      - "pnpm --filter @folio/backend typecheck"
    expected: "comment-target and review-comment facade tests pass; backend typecheck passes or reports only pre-existing unrelated issues."
  risk:
    collision: "medium"
    external_write: false
    database: false
    deployment: false
    notes: "Must prove invalid targets do not call GitHub. No live GitHub calls are made in tests."
  handoff_payload:
    include_spec_sections:
      - "Backend Validation"
      - "Persistence and Failure Behavior"
      - "Tests"
    include_plan_sections:
      - "Task 2: Backend Comment Target Validation"

**Files:**
- Create: `apps/backend/src/domain/review/comment-target.ts`
- Create: `apps/backend/src/domain/review/comment-target.test.ts`
- Modify: `apps/backend/src/application/review/review-comment.facade.ts`
- Test: `apps/backend/src/application/review/review-comment.facade.test.ts`

**Interfaces:**
- Consumes: `ChapterCode.diffLines` from Task 1.
- Produces: `isCommentTargetInChapter(code, target): boolean`, where `target` is `{ path: string; side: "LEFT" | "RIGHT"; line: number }`.

- [ ] **Step 1: Write failing domain tests**

Create `apps/backend/src/domain/review/comment-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ChapterCode } from "./review-read-model.js";
import { isCommentTargetInChapter } from "./comment-target.js";

const code: ChapterCode = {
  files: [{ path: "a.ts", additions: 1, deletions: 1 }],
  diffLines: [
    {
      path: "a.ts",
      n: 4,
      kind: "del",
      text: "old",
      oldLineNumber: 4,
    },
    {
      path: "a.ts",
      n: 5,
      kind: "add",
      text: "new",
      newLineNumber: 5,
    },
    {
      path: "a.ts",
      n: 6,
      kind: "ctx",
      text: "same",
      oldLineNumber: 6,
      newLineNumber: 6,
    },
  ],
};

describe("isCommentTargetInChapter", () => {
  it("accepts deletion targets on LEFT old lines", () => {
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "LEFT", line: 4 })).toBe(true);
  });

  it("accepts addition and context targets on RIGHT new lines", () => {
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "RIGHT", line: 5 })).toBe(true);
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "RIGHT", line: 6 })).toBe(true);
  });

  it("rejects mismatched path, side, or line before GitHub writes", () => {
    expect(isCommentTargetInChapter(code, { path: "b.ts", side: "RIGHT", line: 5 })).toBe(false);
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "LEFT", line: 5 })).toBe(false);
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "RIGHT", line: 4 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @folio/backend test -- src/domain/review/comment-target.test.ts
```

Expected: FAIL because `comment-target.ts` does not exist.

- [ ] **Step 3: Implement the domain validator**

Create `apps/backend/src/domain/review/comment-target.ts`:

```ts
import type { ChapterCode, WebDiffLine } from "./review-read-model.js";

export interface CommentTarget {
  path: string;
  side: "LEFT" | "RIGHT";
  line: number;
}

export function isCommentTargetInChapter(code: ChapterCode, target: CommentTarget): boolean {
  return code.diffLines.some((line) => isMatchingLine(line, target));
}

function isMatchingLine(line: WebDiffLine, target: CommentTarget): boolean {
  if (line.path !== target.path) {
    return false;
  }
  if (target.side === "LEFT") {
    return line.kind === "del" && line.oldLineNumber === target.line;
  }
  return line.kind !== "del" && line.newLineNumber === target.line;
}
```

- [ ] **Step 4: Add facade rejection test**

In `apps/backend/src/application/review/review-comment.facade.test.ts`, update the mocked revision/chapter rows to include a raw diff and hunk refs:

```ts
const rawDiff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,2 +10,3 @@
 const before = true;
+const added = true;
 const after = true;
`;
```

Use:

```ts
revisionsRepo: {
  latestForPr: vi.fn(async () => ({ id: "rev1", rawDiff })),
},
chaptersRepo: {
  listByRevision: vi.fn(async () => [{ id: "chapter1", hunkRefs: [{ filePath: "src/a.ts", oldStart: 10 }] }]),
},
```

Add this test:

```ts
it("rejects targets outside the selected chapter before creating a GitHub comment", async () => {
  const db = await import("@folio/db");
  const facade = new ReviewCommentFacade();

  const result = await facade.createInlineComment({
    owner: "acme",
    repo: "widget",
    number: 7,
    chapterIndex: 1,
    path: "src/other.ts",
    side: "RIGHT",
    line: 11,
    body: "잘못된 대상입니다.",
    authorLogin: "octocat",
  });

  expect(result).toBeNull();
  expect(createReviewComment).not.toHaveBeenCalled();
  expect(db.commentsRepo.create).not.toHaveBeenCalled();
});
```

Add this documentation test for current failure behavior:

```ts
it("surfaces DB persistence failures after GitHub creates the comment", async () => {
  const db = await import("@folio/db");
  vi.mocked(db.commentsRepo.create).mockRejectedValueOnce(new Error("db down"));
  const facade = new ReviewCommentFacade();

  await expect(
    facade.createInlineComment({
      owner: "acme",
      repo: "widget",
      number: 7,
      chapterIndex: 1,
      path: "src/a.ts",
      side: "RIGHT",
      line: 11,
      body: "확인이 필요합니다.",
      authorLogin: "octocat",
    }),
  ).rejects.toThrow("db down");

  expect(createReviewComment).toHaveBeenCalled();
});
```

Ensure `beforeEach` clears mock call history so tests do not leak:

```ts
beforeEach(() => {
  vi.clearAllMocks();
});
```

- [ ] **Step 5: Run facade test to verify it fails**

Run:

```bash
pnpm --filter @folio/backend test -- src/application/review/review-comment.facade.test.ts
```

Expected: FAIL because the facade does not validate targets yet.

- [ ] **Step 6: Wire validation into the facade**

Update imports in `apps/backend/src/application/review/review-comment.facade.ts`:

```ts
import { sliceChapterCode } from "../../domain/review/chapter-diff-slice.js";
import { isCommentTargetInChapter } from "../../domain/review/comment-target.js";
```

After resolving `chapter`, before creating Octokit, add:

```ts
const code = sliceChapterCode(revision.rawDiff ?? "", chapter.hunkRefs ?? []);
if (
  !isCommentTargetInChapter(code, {
    path: input.path,
    side: input.side,
    line: input.line,
  })
) {
  return null;
}
```

- [ ] **Step 7: Run verification**

Run:

```bash
pnpm --filter @folio/backend test -- src/domain/review/comment-target.test.ts src/application/review/review-comment.facade.test.ts
pnpm --filter @folio/backend typecheck
```

Expected: target validator and facade tests pass; typecheck passes.

---

## Task 3: Frontend Comment Targeting and File Filtering

dag:
  id: "frontend-comment-targeting"
  purpose: "Make the web UI submit line-level file paths and render only selected file lines in the Files tab."
  deps: ["backend-diff-identity"]
  parallel_group: "wave-2"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/web/src/lib/review-api.ts"
      - "apps/web/src/components/review/chapter-file-diff.ts"
      - "apps/web/src/components/review/chapter-file-diff.test.ts"
      - "apps/web/src/components/review/diff-comment-target.ts"
      - "apps/web/src/components/review/diff-comment-target.test.ts"
      - "apps/web/src/components/review/diff-viewer.tsx"
      - "apps/web/src/components/review/review-view.tsx"
    modules:
      - "@folio/web"
  verification:
    commands:
      - "pnpm --filter @folio/web test -- src/components/review/chapter-file-diff.test.ts src/components/review/diff-comment-target.test.ts"
      - "pnpm --filter @folio/web typecheck"
    expected: "new web unit tests pass; web typecheck passes."
  risk:
    collision: "medium"
    external_write: false
    database: false
    deployment: false
    notes: "Depends on backend ReviewDiffLine payload shape from Task 1."
  handoff_payload:
    include_spec_sections:
      - "Frontend Comment Targeting"
      - "Tests"
    include_plan_sections:
      - "Task 3: Frontend Comment Targeting and File Filtering"

**Files:**
- Modify: `apps/web/src/lib/review-api.ts`
- Create: `apps/web/src/components/review/chapter-file-diff.ts`
- Create: `apps/web/src/components/review/chapter-file-diff.test.ts`
- Create: `apps/web/src/components/review/diff-comment-target.ts`
- Create: `apps/web/src/components/review/diff-comment-target.test.ts`
- Modify: `apps/web/src/components/review/diff-viewer.tsx`
- Modify: `apps/web/src/components/review/review-view.tsx`

**Interfaces:**
- Consumes: enriched `ReviewDiffLine` from Task 1.
- Produces: `buildFileScopedChapter(chapter, path): ReviewChapter` and `commentTargetForLine(line): { path: string; side: "LEFT" | "RIGHT"; line: number }`.

- [ ] **Step 1: Update the web payload type**

Update `apps/web/src/lib/review-api.ts`:

```ts
export interface ReviewDiffLine {
  path: string;
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
```

- [ ] **Step 2: Write failing file-filtering test**

Create `apps/web/src/components/review/chapter-file-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ReviewChapter } from "@/lib/review-api";
import { buildFileScopedChapter } from "./chapter-file-diff";

const chapter: ReviewChapter = {
  index: 1,
  title: "Chapter",
  summary: "Summary",
  files: [
    { path: "a.ts", additions: 1, deletions: 0 },
    { path: "b.ts", additions: 0, deletions: 1 },
  ],
  diffLines: [
    { path: "a.ts", n: 2, kind: "add", text: "a", newLineNumber: 2 },
    { path: "b.ts", n: 4, kind: "del", text: "b", oldLineNumber: 4 },
  ],
  viewed: false,
};

describe("buildFileScopedChapter", () => {
  it("keeps chapter metadata but only includes the selected file lines and file summary", () => {
    expect(buildFileScopedChapter(chapter, "b.ts")).toEqual({
      ...chapter,
      files: [{ path: "b.ts", additions: 0, deletions: 1 }],
      diffLines: [{ path: "b.ts", n: 4, kind: "del", text: "b", oldLineNumber: 4 }],
    });
  });
});
```

- [ ] **Step 3: Implement file-scoped chapter builder**

Create `apps/web/src/components/review/chapter-file-diff.ts`:

```ts
import type { ReviewChapter } from "@/lib/review-api";

export function buildFileScopedChapter(chapter: ReviewChapter, path: string): ReviewChapter {
  return {
    ...chapter,
    files: chapter.files.filter((file) => file.path === path),
    diffLines: chapter.diffLines.filter((line) => line.path === path),
  };
}
```

- [ ] **Step 4: Write failing comment target test**

Create `apps/web/src/components/review/diff-comment-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commentTargetForLine } from "./diff-comment-target";

describe("commentTargetForLine", () => {
  it("targets deletions on LEFT old lines", () => {
    expect(
      commentTargetForLine({
        path: "a.ts",
        n: 4,
        kind: "del",
        text: "old",
        oldLineNumber: 4,
      }),
    ).toEqual({ path: "a.ts", side: "LEFT", line: 4 });
  });

  it("targets additions and context on RIGHT new lines", () => {
    expect(
      commentTargetForLine({
        path: "a.ts",
        n: 5,
        kind: "add",
        text: "new",
        newLineNumber: 5,
      }),
    ).toEqual({ path: "a.ts", side: "RIGHT", line: 5 });

    expect(
      commentTargetForLine({
        path: "a.ts",
        n: 6,
        kind: "ctx",
        text: "same",
        oldLineNumber: 6,
        newLineNumber: 6,
      }),
    ).toEqual({ path: "a.ts", side: "RIGHT", line: 6 });
  });
});
```

- [ ] **Step 5: Implement comment target mapper**

Create `apps/web/src/components/review/diff-comment-target.ts`:

```ts
import type { CreateReviewCommentInput, ReviewDiffLine } from "@/lib/review-api";

export function commentTargetForLine(
  line: ReviewDiffLine,
): Pick<CreateReviewCommentInput, "path" | "side" | "line"> {
  if (line.kind === "del") {
    return { path: line.path, side: "LEFT", line: line.oldLineNumber ?? line.n };
  }
  return { path: line.path, side: "RIGHT", line: line.newLineNumber ?? line.n };
}
```

- [ ] **Step 6: Wire DiffViewer to line-level targets**

In `apps/web/src/components/review/diff-viewer.tsx`, import:

```ts
import { commentTargetForLine } from "./diff-comment-target";
```

Replace:

```ts
const diffFile = commentContext?.path ?? chapter.files[0]?.path ?? "unknown";
```

with:

```ts
const diffFile = commentContext?.path ?? chapter.files[0]?.path ?? "unknown";
```

Keep this display fallback for the header only. In `submitComment`, replace:

```ts
const side = activeLine.line.kind === "del" ? "LEFT" : "RIGHT";
const result = await createReviewComment(
  commentContext.org,
  commentContext.repo,
  commentContext.number,
  {
    chapterIndex: commentContext.chapterIndex,
    path: diffFile,
    side,
    line: activeLine.line.n,
    body: text,
  },
);
```

with:

```ts
const target = commentTargetForLine(activeLine.line);
const result = await createReviewComment(
  commentContext.org,
  commentContext.repo,
  commentContext.number,
  {
    chapterIndex: commentContext.chapterIndex,
    ...target,
    body: text,
  },
);
```

- [ ] **Step 7: Wire Files tab to file-scoped chapters**

In `apps/web/src/components/review/review-view.tsx`, import:

```ts
import { buildFileScopedChapter } from "@/components/review/chapter-file-diff";
```

Add after `selectedFileChapter`:

```ts
const selectedFileScopedChapter =
  selectedFile && selectedFileChapter
    ? buildFileScopedChapter(selectedFileChapter, selectedFile.path)
    : null;
```

Then change the Files tab condition and props from `selectedFileChapter` to `selectedFileScopedChapter`:

```tsx
{selectedFile && selectedFileScopedChapter ? (
  ...
  <DiffViewer
    chapter={selectedFileScopedChapter}
    compact
    commentContext={{
      org: pr.org,
      repo: pr.repo,
      number: pr.number,
      chapterIndex: selectedFileScopedChapter.index,
      path: selectedFile.path,
    }}
  />
) : (
```

- [ ] **Step 8: Run verification**

Run:

```bash
pnpm --filter @folio/web test -- src/components/review/chapter-file-diff.test.ts src/components/review/diff-comment-target.test.ts
pnpm --filter @folio/web typecheck
```

Expected: new tests and web typecheck pass.

---

## Task 4: Spec Compliance Review

dag:
  id: "spec-review"
  purpose: "Review implemented changes against the approved design spec."
  deps: ["backend-target-validation", "frontend-comment-targeting"]
  parallel_group: "wave-3"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files:
      - "docs/superpowers/specs/2026-07-09-inline-review-comment-hardening-design.md"
      - "apps/backend/src/domain/review"
      - "apps/backend/src/application/review/review-comment.facade.ts"
      - "apps/web/src/components/review"
      - "apps/web/src/lib/review-api.ts"
    modules:
      - "@folio/backend"
      - "@folio/web"
  verification:
    commands:
      - "git diff --stat HEAD"
      - "git diff HEAD -- apps/backend/src apps/web/src"
    expected: "Reviewer confirms every goal is implemented and non-goals were not expanded."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review."
  handoff_payload:
    include_spec_sections:
      - "Goals"
      - "Non-Goals"
      - "Design"
      - "Risks"
    include_plan_sections:
      - "Task 4: Spec Compliance Review"

**Files:** Read-only review.

- [ ] **Step 1: Compare implementation to spec**

Run:

```bash
git diff HEAD -- apps/backend/src apps/web/src
```

Expected: changes preserve diff line identity, frontend line-level targeting, Files tab filtering, and backend pre-GitHub validation.

- [ ] **Step 2: Report findings**

Return either:

```text
SPEC_REVIEW_PASS: no spec gaps found.
```

or:

```text
SPEC_REVIEW_FAIL:
- [severity] file:line issue and required fix
```

---

## Task 5: Code Quality Review

dag:
  id: "quality-review"
  purpose: "Review implementation for maintainability, focused boundaries, and regression risk."
  deps: ["spec-review"]
  parallel_group: "wave-4"
  worktree_strategy: "intra-worktree"
  worker_role: "quality-reviewer"
  scope:
    files:
      - "apps/backend/src/domain/review"
      - "apps/backend/src/application/review/review-comment.facade.ts"
      - "apps/web/src/components/review"
      - "apps/web/src/lib/review-api.ts"
    modules:
      - "@folio/backend"
      - "@folio/web"
  verification:
    commands:
      - "pnpm lint"
      - "pnpm --filter @folio/backend typecheck"
      - "pnpm --filter @folio/web typecheck"
    expected: "No new lint/typecheck issues attributable to this change."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review unless a follow-up fix task is created."
  handoff_payload:
    include_spec_sections:
      - "Design"
      - "Tests"
    include_plan_sections:
      - "Task 5: Code Quality Review"

**Files:** Read-only review.

- [ ] **Step 1: Inspect changed files**

Run:

```bash
git diff HEAD -- apps/backend/src apps/web/src
```

Expected: no vague file names, no unrelated refactors, no duplicated target-matching logic that should be shared within the same layer.

- [ ] **Step 2: Report findings**

Return either:

```text
QUALITY_REVIEW_PASS: no quality blockers found.
```

or:

```text
QUALITY_REVIEW_FAIL:
- [severity] file:line issue and required fix
```

---

## Task 6: Final Verification

dag:
  id: "final-verification"
  purpose: "Run targeted and repo-level verification for the finished inline comment hardening change."
  deps: ["quality-review"]
  parallel_group: "wave-5"
  worktree_strategy: "coordinator-only"
  worker_role: "verifier"
  scope:
    files:
      - "apps/backend/src"
      - "apps/web/src"
      - "packages/github/src"
    modules:
      - "root"
      - "@folio/backend"
      - "@folio/web"
      - "@folio/github"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- src/domain/review/chapter-diff-slice.test.ts src/domain/review/comment-target.test.ts src/application/review/review-comment.facade.test.ts"
      - "pnpm --filter @folio/web test -- src/components/review/chapter-file-diff.test.ts src/components/review/diff-comment-target.test.ts"
      - "pnpm --filter @folio/backend typecheck"
      - "pnpm --filter @folio/web typecheck"
      - "pnpm lint"
    expected: "All targeted checks pass. If root/backend full tests hit the known .env.example mismatch, report it as pre-existing and do not hide it."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "No external writes. Verification may expose unrelated .env.example failure already present before this plan."
  handoff_payload:
    include_spec_sections:
      - "Tests"
      - "Risks"
    include_plan_sections:
      - "Task 6: Final Verification"

**Files:** Verification only.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
pnpm --filter @folio/backend test -- src/domain/review/chapter-diff-slice.test.ts src/domain/review/comment-target.test.ts src/application/review/review-comment.facade.test.ts
```

Expected: all targeted backend comment tests pass.

- [ ] **Step 2: Run targeted web tests**

Run:

```bash
pnpm --filter @folio/web test -- src/components/review/chapter-file-diff.test.ts src/components/review/diff-comment-target.test.ts
```

Expected: all targeted web comment tests pass.

- [ ] **Step 3: Run typecheck and lint**

Run:

```bash
pnpm --filter @folio/backend typecheck
pnpm --filter @folio/web typecheck
pnpm lint
```

Expected: all pass, or any failure is clearly identified as pre-existing and unrelated.

---

## DAG Summary

Waves:

- wave-1: `backend-diff-identity`
- wave-2: `backend-target-validation`, `frontend-comment-targeting`
- wave-3: `spec-review`
- wave-4: `quality-review`
- wave-5: `final-verification`

Dependencies:

- `backend-target-validation` depends on `backend-diff-identity`.
- `frontend-comment-targeting` depends on `backend-diff-identity`.
- `spec-review` depends on `backend-target-validation` and `frontend-comment-targeting`.
- `quality-review` depends on `spec-review`.
- `final-verification` depends on `quality-review`.

Parallelism:

- Task 2 and Task 3 may run in parallel after Task 1 because they edit disjoint backend and frontend files.
- Review and final verification are sequential gates.

Worktree Strategy:

- Implementation tasks use `inter-worktree`.
- Review tasks use `intra-worktree`.
- Final verification is `coordinator-only`.

Decision Gates:

- Stop if validation requires a database migration.
- Stop if tests reveal GitHub compensation deletion or idempotency is required for correctness in this iteration.
- Stop if an implementation worker reports overlapping edits with another active worker.
- Stop if verification fails for a reason that changes the approved design.

## Dispatch Gate Summary

**Dispatch Gate**

Spec: `docs/superpowers/specs/2026-07-09-inline-review-comment-hardening-design.md`
Plan: `docs/superpowers/plans/2026-07-09-inline-review-comment-hardening.md`

Waves:
- wave-1: `backend-diff-identity` using `inter-worktree`
- wave-2: `backend-target-validation`, `frontend-comment-targeting` using `inter-worktree`
- wave-3: `spec-review` using `intra-worktree`
- wave-4: `quality-review` using `intra-worktree`
- wave-5: `final-verification` using `coordinator-only`

Risks:
- ReviewPayload wire shape changes; backend and frontend tasks are sequenced through `backend-diff-identity`.
- GitHub/DB orphan behavior remains documented but not compensated in this iteration.
- Existing `.env.example` mismatch can still fail broader backend test runs; targeted checks must report it separately.

Verification:
- `pnpm --filter @folio/backend test -- src/domain/review/chapter-diff-slice.test.ts src/domain/review/comment-target.test.ts src/application/review/review-comment.facade.test.ts` expects all targeted backend comment tests to pass.
- `pnpm --filter @folio/web test -- src/components/review/chapter-file-diff.test.ts src/components/review/diff-comment-target.test.ts` expects all targeted web comment tests to pass.
- `pnpm --filter @folio/backend typecheck`, `pnpm --filter @folio/web typecheck`, and `pnpm lint` expect no new issues.

Decision gates:
- Database migration required.
- External GitHub write policy needs compensation or idempotency beyond the approved spec.
- Worker edit overlap.
- Verification failure implies the approved design is wrong.

Approve worker dispatch?

## Plan Self-Review

- Spec coverage: Goals map to Tasks 1-3; tests map to Tasks 1-3 and Task 6; non-goals are enforced in Global Constraints and Decision Gates.
- Placeholder scan: No placeholder markers remain.
- Type consistency: `WebDiffLine`, `CommentTarget`, `buildFileScopedChapter`, and `commentTargetForLine` signatures are consistent across tasks.
- Same-wave collision check: Task 2 edits backend files and Task 3 edits frontend files, so wave-2 has no file overlap.
- Review coverage: Implementation tasks feed spec review, quality review, and final verification.
