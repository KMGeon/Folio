# File Status Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show added, modified, deleted, renamed, and moved file status indicators in the review UI file lists.

**Architecture:** Preserve real GitHub diff file status in the backend review read model, expose it through the frontend review API types, then render compact status icons and one-letter chips in file-list surfaces. Keep line-count aggregation behavior unchanged and avoid deriving status from additions/deletions.

**Tech Stack:** TypeScript ESM, NestJS backend, Next.js App Router frontend, Vitest, lucide-react, Tailwind v4 tokens from `apps/web/src/app/globals.css`.

## Global Constraints

- Follow `docs/design-system.md`: Folio is dark-mode only, dense, and token-driven.
- Do not add new dependencies.
- Do not change database schema or persisted review state.
- Do not add file-status filters.
- Do not change diff line colors or split/unified diff behavior.
- Do not show rename old paths in this change.
- Do not use vague file names such as `helpers`, `utils`, `common`, or `misc`.
- API responses must continue to use the existing common response envelope.

---

## File Structure

- `apps/backend/src/domain/review/review-read-model.ts`: Owns web-facing backend review payload interfaces. Add `FileStatus` to `WebChapterFile`.
- `apps/backend/src/domain/review/chapter-diff-slice.ts`: Converts parsed diff hunks into chapter code. Preserve parsed `file.status`.
- `apps/backend/src/domain/review/chapter-diff-slice.test.ts`: Proves status is preserved from parsed diff files.
- `apps/backend/src/domain/review/comment-target.test.ts`: Update typed fixture because `WebChapterFile.status` becomes required.
- `apps/web/src/lib/review-api.ts`: Owns frontend review payload interfaces. Add local `ReviewFileStatus` union and `ReviewChapterFile.status`.
- `apps/web/src/components/review/changed-file-summary.ts`: New focused module for aggregating chapter files into the `Files` tab file summary.
- `apps/web/src/components/review/changed-file-summary.test.ts`: Tests aggregation line counts and status preservation.
- `apps/web/src/components/review/chapter-file-diff.test.ts`: Update fixture and assertion to include status.
- `apps/web/src/components/review/changed-file-tree.tsx`: Render status icon/chip in the `Files` tab tree.
- `apps/web/src/components/review/chapter-panel.tsx`: Render status icon/chip in chapter changed-files list.
- `apps/web/src/components/review/review-view.tsx`: Use extracted aggregation and render selected-file header status.

---

## DAG Overview

### Task DAG

| ID | Task | Depends On | Parallel Group | Strategy | Role |
| --- | --- | --- | --- | --- | --- |
| `backend-status` | Preserve backend file status in review payload | none | `wave-1` | `inter-worktree` | `implementer` |
| `frontend-model` | Add frontend status type and tested file aggregation | `backend-status` | `wave-2` | `inter-worktree` | `implementer` |
| `ui-indicators` | Render status indicators in approved UI surfaces | `frontend-model` | `wave-3` | `inter-worktree` | `implementer` |
| `spec-review` | Review implementation against spec | `ui-indicators` | `wave-4` | `intra-worktree` | `spec-reviewer` |
| `quality-review` | Review code quality, maintainability, and test coverage | `spec-review` | `wave-5` | `intra-worktree` | `quality-reviewer` |
| `final-verify` | Run full verification and report result | `quality-review` | `wave-6` | `coordinator-only` | `verifier` |

Wave rule: implementation tasks are sequential because frontend model work depends on the backend payload contract, and UI work depends on the frontend `ChangedFile` status shape. Review and verification tasks run after implementation.

---

### Task 1: Preserve Backend File Status

```yaml
dag:
  id: "backend-status"
  purpose: "Add parsed GitHub file status to backend review chapter file payloads."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/backend/src/domain/review/review-read-model.ts"
      - "apps/backend/src/domain/review/chapter-diff-slice.ts"
      - "apps/backend/src/domain/review/chapter-diff-slice.test.ts"
      - "apps/backend/src/domain/review/comment-target.test.ts"
    modules:
      - "@folio/backend"
  verification:
    commands:
      - "pnpm test apps/backend/src/domain/review/chapter-diff-slice.test.ts apps/backend/src/domain/review/comment-target.test.ts"
      - "pnpm --filter @folio/backend typecheck"
    expected: "Vitest passes both backend review-domain test files; backend typecheck exits 0."
  risk:
    collision: "low"
    external_write: false
    database: false
    deployment: false
    notes: "Touches backend review-domain read model only; no DB or external API writes."
  handoff_payload:
    include_spec_sections:
      - "Data Contract"
      - "Testing"
    include_plan_sections:
      - "Task 1: Preserve Backend File Status"
```

**Files:**
- Modify: `apps/backend/src/domain/review/review-read-model.ts`
- Modify: `apps/backend/src/domain/review/chapter-diff-slice.ts`
- Modify: `apps/backend/src/domain/review/chapter-diff-slice.test.ts`
- Modify: `apps/backend/src/domain/review/comment-target.test.ts`

**Interfaces:**
- Consumes: `PullRequestFile.status` from `@folio/types`.
- Produces: `WebChapterFile.status: FileStatus`, required by frontend payload consumers in later tasks.

- [ ] **Step 1: Write the failing backend status test**

In `apps/backend/src/domain/review/chapter-diff-slice.test.ts`, update the first file assertion and add one focused deleted-file assertion.

```ts
expect(code.files).toEqual([{ path: "a.ts", status: "modified", additions: 1, deletions: 0 }]);
```

Add this test inside the existing `describe("sliceChapterCode", () => { ... })` block:

```ts
it("preserves parsed file status on rendered chapter files", () => {
  const deletedDiff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index 3b18e51..0000000
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const old = true;
-export { old };
`;

  const code = sliceChapterCode(deletedDiff, [{ filePath: "old.ts", oldStart: 1 }]);

  expect(code.files).toEqual([{ path: "old.ts", status: "deleted", additions: 0, deletions: 2 }]);
});
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run:

```bash
pnpm test apps/backend/src/domain/review/chapter-diff-slice.test.ts
```

Expected: FAIL because `code.files` objects do not include `status`.

- [ ] **Step 3: Add status to the backend read model**

In `apps/backend/src/domain/review/review-read-model.ts`, import the type and update `WebChapterFile`:

```ts
import type { FileStatus } from "@folio/types";

/** Web-facing diff line: file identity plus display line data for comments. */
export interface WebDiffLine {
  path: string;
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface WebChapterFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}
```

- [ ] **Step 4: Preserve status in chapter slicing**

In `apps/backend/src/domain/review/chapter-diff-slice.ts`, change the default `entry` object:

```ts
const entry = touched.get(file.path) ?? {
  path: file.path,
  status: file.status,
  additions: 0,
  deletions: 0,
};
```

- [ ] **Step 5: Update typed backend fixtures**

In `apps/backend/src/domain/review/comment-target.test.ts`, update the `code.files` fixture:

```ts
files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1 }],
```

In `apps/backend/src/domain/review/chapter-diff-slice.test.ts`, update the second test to assert the full file summary as well as line summaries:

```ts
expect(code.files).toEqual([
  { path: "a.ts", status: "modified", additions: 1, deletions: 0 },
  { path: "b.ts", status: "modified", additions: 0, deletions: 1 },
]);
```

Keep the missing-ref test expectation unchanged:

```ts
expect(code.files).toEqual([]);
```

- [ ] **Step 6: Run backend targeted verification**

Run:

```bash
pnpm test apps/backend/src/domain/review/chapter-diff-slice.test.ts apps/backend/src/domain/review/comment-target.test.ts
pnpm --filter @folio/backend typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/backend/src/domain/review/review-read-model.ts \
  apps/backend/src/domain/review/chapter-diff-slice.ts \
  apps/backend/src/domain/review/chapter-diff-slice.test.ts \
  apps/backend/src/domain/review/comment-target.test.ts
git commit -m "feat(review): expose file status in chapter code"
```

---

### Task 2: Add Frontend Status Model And Aggregation

```yaml
dag:
  id: "frontend-model"
  purpose: "Add frontend review file status types and tested changed-file aggregation."
  deps: ["backend-status"]
  parallel_group: "wave-2"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/web/src/lib/review-api.ts"
      - "apps/web/src/components/review/changed-file-summary.ts"
      - "apps/web/src/components/review/changed-file-summary.test.ts"
      - "apps/web/src/components/review/chapter-file-diff.test.ts"
      - "apps/web/src/components/review/review-view.tsx"
    modules:
      - "@folio/web"
  verification:
    commands:
      - "pnpm test apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts"
      - "pnpm --filter @folio/web typecheck"
    expected: "Vitest passes the frontend review component tests; web typecheck exits 0."
  risk:
    collision: "medium"
    external_write: false
    database: false
    deployment: false
    notes: "Touches review-view aggregation that the UI task will also use; run before UI task."
  handoff_payload:
    include_spec_sections:
      - "Data Contract"
      - "Component Scope"
      - "Testing"
    include_plan_sections:
      - "Task 2: Add Frontend Status Model And Aggregation"
```

**Files:**
- Modify: `apps/web/src/lib/review-api.ts`
- Create: `apps/web/src/components/review/changed-file-summary.ts`
- Create: `apps/web/src/components/review/changed-file-summary.test.ts`
- Modify: `apps/web/src/components/review/chapter-file-diff.test.ts`
- Modify: `apps/web/src/components/review/review-view.tsx`

**Interfaces:**
- Consumes: backend payload field `ReviewChapterFile.status`.
- Produces:
  - `ReviewFileStatus = "added" | "modified" | "deleted" | "renamed" | "moved"`
  - `ChangedFile` interface from `changed-file-summary.ts`
  - `aggregateChangedFiles(chapters: ReviewChapter[]): ChangedFile[]`

- [ ] **Step 1: Add frontend file status type**

In `apps/web/src/lib/review-api.ts`, add the local wire union before `ReviewChapterFile`:

```ts
export type ReviewFileStatus = "added" | "modified" | "deleted" | "renamed" | "moved";

export interface ReviewChapterFile {
  path: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
}
```

Expected type impact: tests and fixtures that construct `ReviewChapterFile` now need `status`.

- [ ] **Step 2: Write the changed-file aggregation test**

Create `apps/web/src/components/review/changed-file-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import { aggregateChangedFiles } from "./changed-file-summary";

const chapters: ReviewChapter[] = [
  {
    index: 1,
    title: "Setup",
    summary: "Adds setup",
    files: [
      { path: "src/a.ts", status: "added", additions: 2, deletions: 0 },
      { path: "src/b.ts", status: "modified", additions: 1, deletions: 1 },
    ],
    diffLines: [],
    viewed: false,
  },
  {
    index: 2,
    title: "Cleanup",
    summary: "Continues setup",
    files: [{ path: "src/a.ts", status: "added", additions: 3, deletions: 0 }],
    diffLines: [],
    viewed: true,
  },
];

describe("aggregateChangedFiles", () => {
  it("dedupes by path, sums line counts, and preserves file status", () => {
    expect(aggregateChangedFiles(chapters)).toEqual([
      {
        path: "src/a.ts",
        status: "added",
        additions: 5,
        deletions: 0,
        chapterIndex: 1,
        chapterTitle: "Setup",
      },
      {
        path: "src/b.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        chapterIndex: 1,
        chapterTitle: "Setup",
      },
    ]);
  });
});
```

- [ ] **Step 3: Run the frontend aggregation test to verify it fails**

Run:

```bash
pnpm test apps/web/src/components/review/changed-file-summary.test.ts
```

Expected: FAIL because `changed-file-summary.ts` does not exist.

- [ ] **Step 4: Implement changed-file aggregation module**

Create `apps/web/src/components/review/changed-file-summary.ts`:

```ts
import type { ReviewChapter, ReviewFileStatus } from "@/lib/review-api";

export interface ChangedFile {
  path: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  chapterIndex: number;
  chapterTitle: string;
}

/** Aggregate every chapter's files into a deduped changed-file list for the Files tab. */
export function aggregateChangedFiles(chapters: ReviewChapter[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const chapter of chapters) {
    for (const file of chapter.files) {
      const existing = byPath.get(file.path);
      if (existing) {
        existing.additions += file.additions;
        existing.deletions += file.deletions;
      } else {
        byPath.set(file.path, {
          path: file.path,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          chapterIndex: chapter.index,
          chapterTitle: chapter.title,
        });
      }
    }
  }
  return [...byPath.values()];
}
```

- [ ] **Step 5: Update file-scoped chapter test fixture**

In `apps/web/src/components/review/chapter-file-diff.test.ts`, update fixture files and expected output:

```ts
files: [
  { path: "a.ts", status: "added", additions: 1, deletions: 0 },
  { path: "b.ts", status: "deleted", additions: 0, deletions: 1 },
],
```

Expected selected file assertion:

```ts
files: [{ path: "b.ts", status: "deleted", additions: 0, deletions: 1 }],
```

- [ ] **Step 6: Replace inline aggregation in review-view**

In `apps/web/src/components/review/review-view.tsx`, replace:

```ts
import { FileTree, type ChangedFile } from "@/components/review/changed-file-tree";
```

with:

```ts
import { FileTree } from "@/components/review/changed-file-tree";
import { aggregateChangedFiles } from "@/components/review/changed-file-summary";
```

Delete the inline `aggregateFiles()` function and change:

```ts
const files = aggregateFiles(chapters);
```

to:

```ts
const files = aggregateChangedFiles(chapters);
```

- [ ] **Step 7: Update changed-file-tree type source**

In `apps/web/src/components/review/changed-file-tree.tsx`, delete the local `ChangedFile` interface and import the shared one:

```ts
import type { ChangedFile } from "@/components/review/changed-file-summary";
```

Keep the component behavior unchanged in this task.

- [ ] **Step 8: Run frontend targeted verification**

Run:

```bash
pnpm test apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts
pnpm --filter @folio/web typecheck
```

Expected: both commands PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add apps/web/src/lib/review-api.ts \
  apps/web/src/components/review/changed-file-summary.ts \
  apps/web/src/components/review/changed-file-summary.test.ts \
  apps/web/src/components/review/chapter-file-diff.test.ts \
  apps/web/src/components/review/changed-file-tree.tsx \
  apps/web/src/components/review/review-view.tsx
git commit -m "feat(review): model changed file status"
```

---

### Task 3: Render File Status Indicators

```yaml
dag:
  id: "ui-indicators"
  purpose: "Show status-colored icons and chips in the Files tab and chapter changed-files list."
  deps: ["frontend-model"]
  parallel_group: "wave-3"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/web/src/components/review/changed-file-tree.tsx"
      - "apps/web/src/components/review/chapter-panel.tsx"
      - "apps/web/src/components/review/review-view.tsx"
    modules:
      - "@folio/web"
  verification:
    commands:
      - "pnpm --filter @folio/web typecheck"
      - "pnpm test apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts"
    expected: "Web typecheck exits 0; targeted frontend tests pass."
  risk:
    collision: "medium"
    external_write: false
    database: false
    deployment: false
    notes: "UI changes touch review surfaces only; no external writes."
  handoff_payload:
    include_spec_sections:
      - "UI Treatment"
      - "Component Scope"
    include_plan_sections:
      - "Task 3: Render File Status Indicators"
```

**Files:**
- Modify: `apps/web/src/components/review/changed-file-tree.tsx`
- Modify: `apps/web/src/components/review/chapter-panel.tsx`
- Modify: `apps/web/src/components/review/review-view.tsx`

**Interfaces:**
- Consumes: `ChangedFile.status` and `ReviewChapterFile.status`.
- Produces: `FileStatusMarker({ status, active? })` rendering used in approved file-list surfaces.

- [ ] **Step 1: Add status marker to changed-file-tree**

In `apps/web/src/components/review/changed-file-tree.tsx`, replace the import with:

```ts
import { FileMinus2, FilePenLine, FilePlus2, FileSymlink, Folder } from "lucide-react";

import type { ChangedFile } from "@/components/review/changed-file-summary";
import type { ReviewFileStatus } from "@/lib/review-api";
import { cn } from "@/lib/utils";
```

Add this metadata near the top of the file:

```ts
const FILE_STATUS_META: Record<
  ReviewFileStatus,
  {
    label: string;
    chip: string;
    icon: typeof FilePlus2;
    className: string;
    chipClassName: string;
  }
> = {
  added: {
    label: "Added",
    chip: "A",
    icon: FilePlus2,
    className: "text-diff-add-fg",
    chipClassName: "border-diff-add-fg/30 bg-diff-add-bg text-diff-add-fg",
  },
  modified: {
    label: "Modified",
    chip: "M",
    icon: FilePenLine,
    className: "text-muted-foreground",
    chipClassName: "border-border bg-muted/60 text-muted-foreground",
  },
  deleted: {
    label: "Deleted",
    chip: "D",
    icon: FileMinus2,
    className: "text-diff-del-fg",
    chipClassName: "border-diff-del-fg/30 bg-diff-del-bg text-diff-del-fg",
  },
  renamed: {
    label: "Renamed",
    chip: "R",
    icon: FileSymlink,
    className: "text-syntax-link",
    chipClassName: "border-syntax-link/30 bg-syntax-link/10 text-syntax-link",
  },
  moved: {
    label: "Moved",
    chip: "V",
    icon: FileSymlink,
    className: "text-syntax-link",
    chipClassName: "border-syntax-link/30 bg-syntax-link/10 text-syntax-link",
  },
};

export function FileStatusMarker({
  status,
  active = false,
}: {
  status: ReviewFileStatus;
  active?: boolean;
}) {
  const meta = FILE_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={meta.label}>
      <Icon className={cn("size-4", meta.className, active && "text-primary")} />
      <span
        className={cn(
          "inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none",
          meta.chipClassName,
          active && status === "modified" && "text-foreground",
        )}
      >
        {meta.chip}
      </span>
    </span>
  );
}
```

In the file row, replace the old file icon:

```tsx
<FileText className={cn("size-4 shrink-0", active && "text-primary")} />
```

with:

```tsx
<FileStatusMarker status={file.status} active={active} />
```

- [ ] **Step 2: Use status marker in chapter changed-files list**

In `apps/web/src/components/review/chapter-panel.tsx`, add:

```ts
import { FileStatusMarker } from "@/components/review/changed-file-tree";
```

In the `chapter.files.map((file) => (` row, insert the marker before the file path:

```tsx
<FileStatusMarker status={file.status} />
<span className="min-w-0 flex-1 truncate">{file.path}</span>
```

Keep the existing `+{file.additions}` and optional `-{file.deletions}` spans unchanged.

- [ ] **Step 3: Use status marker in selected file header**

In `apps/web/src/components/review/review-view.tsx`, update the changed-file-tree import:

```ts
import { FileStatusMarker, FileTree } from "@/components/review/changed-file-tree";
```

In the selected file header, replace:

```tsx
<FileText className="size-4 text-primary" />
```

with:

```tsx
<FileStatusMarker status={selectedFile.status} active />
```

- [ ] **Step 4: Run UI targeted verification**

Run:

```bash
pnpm --filter @folio/web typecheck
pnpm test apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts
```

Expected: both commands PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/web/src/components/review/changed-file-tree.tsx \
  apps/web/src/components/review/chapter-panel.tsx \
  apps/web/src/components/review/review-view.tsx
git commit -m "feat(review): show changed file status indicators"
```

---

### Task 4: Spec Compliance Review

```yaml
dag:
  id: "spec-review"
  purpose: "Check the implemented behavior against the approved design spec."
  deps: ["ui-indicators"]
  parallel_group: "wave-4"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files:
      - "docs/superpowers/specs/2026-07-09-file-status-colors-design.md"
      - "apps/backend/src/domain/review/review-read-model.ts"
      - "apps/backend/src/domain/review/chapter-diff-slice.ts"
      - "apps/web/src/lib/review-api.ts"
      - "apps/web/src/components/review/changed-file-tree.tsx"
      - "apps/web/src/components/review/chapter-panel.tsx"
      - "apps/web/src/components/review/review-view.tsx"
    modules:
      - "@folio/backend"
      - "@folio/web"
  verification:
    commands:
      - "git diff HEAD~3..HEAD --stat"
      - "git diff HEAD~3..HEAD -- apps/backend/src/domain/review apps/web/src/lib/review-api.ts apps/web/src/components/review"
    expected: "Reviewer reports PASS or concrete fix tasks; no code changes unless a fix task is created."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review task."
  handoff_payload:
    include_spec_sections:
      - "Goal"
      - "Non-Goals"
      - "Data Contract"
      - "UI Treatment"
      - "Testing"
    include_plan_sections:
      - "Task 4: Spec Compliance Review"
```

**Files:**
- Read: `docs/superpowers/specs/2026-07-09-file-status-colors-design.md`
- Read: implementation diffs from Tasks 1-3

**Interfaces:**
- Consumes: committed implementation from Tasks 1-3.
- Produces: PASS report or a list of exact fix tasks.

- [ ] **Step 1: Review against approved spec**

Check these exact requirements:

```text
1. Backend and frontend chapter file payloads include real file status.
2. No status inference from additions/deletions was added.
3. Files tab tree shows status marker.
4. Files tab selected file header shows status marker.
5. Chapter changed-files list shows status marker.
6. No file-status filters were added.
7. No database schema or persisted review-state changes were added.
8. Diff line colors and split/unified behavior were not changed.
9. Rename old paths are not displayed.
```

- [ ] **Step 2: Report review result**

If all checks pass, report:

```text
SPEC_REVIEW PASS
```

If any check fails, report:

```text
SPEC_REVIEW FAIL
- <file>:<line> <specific issue>
- Required fix: <specific change>
```

---

### Task 5: Code Quality Review

```yaml
dag:
  id: "quality-review"
  purpose: "Review code quality, naming, token usage, and test coverage after spec compliance passes."
  deps: ["spec-review"]
  parallel_group: "wave-5"
  worktree_strategy: "intra-worktree"
  worker_role: "quality-reviewer"
  scope:
    files:
      - "apps/backend/src/domain/review/review-read-model.ts"
      - "apps/backend/src/domain/review/chapter-diff-slice.ts"
      - "apps/web/src/components/review/changed-file-summary.ts"
      - "apps/web/src/components/review/changed-file-tree.tsx"
      - "apps/web/src/components/review/chapter-panel.tsx"
      - "apps/web/src/components/review/review-view.tsx"
    modules:
      - "@folio/backend"
      - "@folio/web"
  verification:
    commands:
      - "pnpm lint"
      - "pnpm typecheck"
      - "pnpm test apps/backend/src/domain/review/chapter-diff-slice.test.ts apps/backend/src/domain/review/comment-target.test.ts apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts"
    expected: "Lint, typecheck, and targeted tests pass; reviewer reports PASS or concrete fix tasks."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review unless a fix task is explicitly created."
  handoff_payload:
    include_spec_sections:
      - "UI Treatment"
      - "Testing"
    include_plan_sections:
      - "Task 5: Code Quality Review"
```

**Files:**
- Read: implementation files from Tasks 1-3

**Interfaces:**
- Consumes: spec review PASS.
- Produces: QUALITY_REVIEW PASS or exact fix tasks.

- [ ] **Step 1: Run quality checks**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test apps/backend/src/domain/review/chapter-diff-slice.test.ts apps/backend/src/domain/review/comment-target.test.ts apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts
```

Expected: all commands PASS.

- [ ] **Step 2: Review code manually**

Check these exact items:

```text
1. New module name is concrete: changed-file-summary.ts.
2. No raw color values were added to React components.
3. UI uses existing tokens/classes: diff add, diff del, syntax link, muted, border.
4. No dependency was added to apps/web/package.json.
5. FileStatusMarker does not create nested cards or large visual fills.
6. Tests cover backend status preservation and frontend aggregation/status retention.
```

- [ ] **Step 3: Report review result**

If all checks pass, report:

```text
QUALITY_REVIEW PASS
```

If any check fails, report:

```text
QUALITY_REVIEW FAIL
- <file>:<line> <specific issue>
- Required fix: <specific change>
```

---

### Task 6: Final Verification

```yaml
dag:
  id: "final-verify"
  purpose: "Run full repository verification and prepare final status."
  deps: ["quality-review"]
  parallel_group: "wave-6"
  worktree_strategy: "coordinator-only"
  worker_role: "verifier"
  scope:
    files:
      - "package.json"
      - "apps/backend/src/domain/review"
      - "apps/web/src/components/review"
      - "apps/web/src/lib/review-api.ts"
    modules:
      - "repo root"
  verification:
    commands:
      - "pnpm lint"
      - "pnpm typecheck"
      - "pnpm test"
      - "pnpm build"
    expected: "All four commands exit 0."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Full local verification only."
  handoff_payload:
    include_spec_sections:
      - "Testing"
    include_plan_sections:
      - "Task 6: Final Verification"
```

**Files:**
- Read: repository final state

**Interfaces:**
- Consumes: implementation and review tasks.
- Produces: final verification evidence.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands PASS.

- [ ] **Step 2: Check final git state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only intentional committed changes are present; latest commits include Task 1, Task 2, and Task 3 implementation commits.

- [ ] **Step 3: Report final verification**

Report:

```text
FINAL_VERIFY PASS
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS
- pnpm build: PASS
```

If a command fails, report:

```text
FINAL_VERIFY FAIL
- <command>: <failure summary>
- Next fix task: <specific task to create>
```

---

## Dispatch Gate

Spec: `docs/superpowers/specs/2026-07-09-file-status-colors-design.md`
Plan: `docs/superpowers/plans/2026-07-09-file-status-colors.md`

Waves:

- `wave-1`: `backend-status` using `inter-worktree`
- `wave-2`: `frontend-model` using `inter-worktree`
- `wave-3`: `ui-indicators` using `inter-worktree`
- `wave-4`: `spec-review` using `intra-worktree`
- `wave-5`: `quality-review` using `intra-worktree`
- `wave-6`: `final-verify` using `coordinator-only`

Dependencies:

- `frontend-model` depends on `backend-status`
- `ui-indicators` depends on `frontend-model`
- `spec-review` depends on `ui-indicators`
- `quality-review` depends on `spec-review`
- `final-verify` depends on `quality-review`

Worker roles:

- Implementers: `backend-status`, `frontend-model`, `ui-indicators`
- Reviewers: `spec-review`, `quality-review`
- Verifier: `final-verify`

Verification:

- `pnpm test apps/backend/src/domain/review/chapter-diff-slice.test.ts apps/backend/src/domain/review/comment-target.test.ts` expects PASS.
- `pnpm test apps/web/src/components/review/changed-file-summary.test.ts apps/web/src/components/review/chapter-file-diff.test.ts` expects PASS.
- `pnpm lint` expects PASS.
- `pnpm typecheck` expects PASS.
- `pnpm test` expects PASS.
- `pnpm build` expects PASS.

Risks:

- Frontend UI task depends on the extracted `ChangedFile` status shape; mitigate by running it after `frontend-model`.
- `docs/superpowers/` is ignored by default; force-add this plan file if committing it.
- UI is not covered by screenshot tests in this plan; mitigate with typecheck, targeted tests, and final manual review of the local dev UI if the executor starts `pnpm dev:web`.

Decision gates:

- Stop if backend parser output does not classify deleted/renamed/moved statuses as expected.
- Stop if full verification fails in a way that suggests the plan is wrong rather than a local implementation mistake.
- Stop if an unrelated user change appears in one of the planned files before worker edits.
- Stop before external API writes, deployment, database migrations, or credential changes; none are expected for this plan.

Approve worker dispatch?
