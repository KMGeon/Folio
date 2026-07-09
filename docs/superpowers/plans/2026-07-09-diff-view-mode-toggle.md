# Diff View Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Unified / Split` selector to Folio's review diff UI while keeping existing unified rendering as the default.

**Architecture:** `DiffViewer` owns the local view-mode state and chooses between existing unified table rendering and a new split table. A small pure helper in `split-diff-rows.ts` derives old/new row pairs from existing `ReviewDiffLine` values so comment targets and backend payloads stay unchanged.

**Tech Stack:** Next.js App Router, React 19, TypeScript ESM, Tailwind token classes, Vitest source-level tests.

## Global Constraints

- Keep `Unified` as the default.
- Do not change backend diff payloads.
- Do not change inline comment target semantics or API calls.
- Do not persist the selected view mode across page reloads.
- Reuse existing design tokens and dense dark review styling.
- Use TDD: write failing tests before production code.

---

### Task 1: Split Diff Row Model

**Files:**
- Create: `apps/web/src/components/review/split-diff-rows.ts`
- Test: `apps/web/src/components/review/split-diff-rows.test.ts`

**Interfaces:**
- Consumes: `ReviewDiffLine` from `@/lib/review-api`.
- Produces:

```ts
export interface SplitDiffRow {
  oldLine: ReviewDiffLine | null;
  newLine: ReviewDiffLine | null;
}

export function buildSplitDiffRows(lines: ReviewDiffLine[]): SplitDiffRow[];
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/review/split-diff-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ReviewDiffLine } from "@/lib/review-api";

import { buildSplitDiffRows } from "./split-diff-rows";

const del = (n: number, text: string): ReviewDiffLine => ({
  path: "a.ts",
  n,
  kind: "del",
  text,
  oldLineNumber: n,
});

const add = (n: number, text: string): ReviewDiffLine => ({
  path: "a.ts",
  n,
  kind: "add",
  text,
  newLineNumber: n,
});

const ctx = (n: number, text: string): ReviewDiffLine => ({
  path: "a.ts",
  n,
  kind: "ctx",
  text,
  oldLineNumber: n,
  newLineNumber: n,
});

describe("buildSplitDiffRows", () => {
  it("pairs context lines on both sides", () => {
    const line = ctx(1, "same");

    expect(buildSplitDiffRows([line])).toEqual([{ oldLine: line, newLine: line }]);
  });

  it("pairs adjacent deletion and addition blocks by index", () => {
    const oldA = del(2, "old a");
    const oldB = del(3, "old b");
    const newA = add(2, "new a");

    expect(buildSplitDiffRows([oldA, oldB, newA])).toEqual([
      { oldLine: oldA, newLine: newA },
      { oldLine: oldB, newLine: null },
    ]);
  });

  it("keeps standalone additions on the new side", () => {
    const line = add(4, "new only");

    expect(buildSplitDiffRows([line])).toEqual([{ oldLine: null, newLine: line }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/web test -- split-diff-rows`

Expected: FAIL because `./split-diff-rows` does not exist.

- [ ] **Step 3: Implement the pure row builder**

Create `apps/web/src/components/review/split-diff-rows.ts`:

```ts
import type { ReviewDiffLine } from "@/lib/review-api";

export interface SplitDiffRow {
  oldLine: ReviewDiffLine | null;
  newLine: ReviewDiffLine | null;
}

export function buildSplitDiffRows(lines: ReviewDiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "ctx") {
      rows.push({ oldLine: line, newLine: line });
      index += 1;
      continue;
    }

    if (line.kind === "del") {
      const deletions: ReviewDiffLine[] = [];
      const additions: ReviewDiffLine[] = [];

      while (lines[index]?.kind === "del") {
        deletions.push(lines[index]);
        index += 1;
      }

      while (lines[index]?.kind === "add") {
        additions.push(lines[index]);
        index += 1;
      }

      const count = Math.max(deletions.length, additions.length);
      for (let offset = 0; offset < count; offset += 1) {
        rows.push({
          oldLine: deletions[offset] ?? null,
          newLine: additions[offset] ?? null,
        });
      }
      continue;
    }

    rows.push({ oldLine: null, newLine: line });
    index += 1;
  }

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/web test -- split-diff-rows`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/review/split-diff-rows.ts apps/web/src/components/review/split-diff-rows.test.ts
git commit -m "test(web): cover split diff row pairing"
```

### Task 2: Diff Viewer Mode Toggle

**Files:**
- Modify: `apps/web/src/components/review/diff-viewer.tsx`
- Test: `apps/web/src/components/review/diff-viewer.test.ts`

**Interfaces:**
- Consumes: `buildSplitDiffRows(lines: ReviewDiffLine[]): SplitDiffRow[]`.
- Produces: local `DiffViewMode = "unified" | "split"` state and split rendering path.

- [ ] **Step 1: Write the failing source-level test**

Create `apps/web/src/components/review/diff-viewer.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "diff-viewer.tsx"), "utf8");

describe("DiffViewer source", () => {
  it("offers unified and split diff view modes", () => {
    expect(source).toContain('type DiffViewMode = "unified" | "split";');
    expect(source).toContain("Unified");
    expect(source).toContain("Split");
  });

  it("renders split mode from existing ReviewDiffLine values", () => {
    expect(source).toContain("buildSplitDiffRows(chapter.diffLines)");
    expect(source).toContain("commentTargetForLine(activeLine.line)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/web test -- diff-viewer`

Expected: FAIL because the mode type, labels, and split row call are missing.

- [ ] **Step 3: Add state, segmented control, and split render path**

Modify `diff-viewer.tsx` to:

- import `buildSplitDiffRows`;
- define `type DiffViewMode = "unified" | "split";`;
- add `const [viewMode, setViewMode] = useState<DiffViewMode>("unified");`;
- reset `activeLine`, `body`, and `error` when changing modes;
- add a compact `Unified / Split` segmented control in the file header;
- keep current unified table in a `viewMode === "unified"` branch;
- add a split table branch that renders old/new line cells from `buildSplitDiffRows(chapter.diffLines)`;
- use the same `setActiveLine({ key, line })`, `InlineCommentEditor`, `created`, and `submitComment` flow in both modes.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
pnpm --filter @folio/web test -- split-diff-rows diff-viewer diff-comment-target
pnpm --filter @folio/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/review/diff-viewer.tsx apps/web/src/components/review/diff-viewer.test.ts
git commit -m "feat(web): add split diff view mode"
```

### Task 3: Full Verification

**Files:**
- No code files.

**Interfaces:**
- Consumes: committed implementation from Tasks 1 and 2.
- Produces: clean verification result for the branch.

- [ ] **Step 1: Run full checks**

Run:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands pass without warnings requiring code changes.

- [ ] **Step 2: Inspect git status**

Run: `git status --short`

Expected: no uncommitted implementation changes except intentionally uncommitted verification artifacts, which should not exist for this task.
