# Key-Change LineRef Jump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the chapter review panel, clicking a 검토할 사항 question body jumps to its first valid `lineRef` in the chapter diff (expand + scroll + brief highlight), while the checkbox only toggles viewed state.

**Architecture:** Pure `resolve-line-ref` maps `LineRef` → `ReviewDiffLine`. `ReviewView` owns `jumpTarget` and miss notices, uncollapses the target file, and passes the target into `DiffViewer`. Diff rows get stable DOM ids; after paint the viewer scrolls the resolved row into view and clears highlight after ~2s. `ChapterPanel` splits checkbox vs jump controls.

**Tech Stack:** pnpm monorepo, TypeScript ESM, Next.js App Router (`apps/web`), Vitest + happy-dom, existing review components under `apps/web/src/components/review/`.

## Global Constraints

- Frontend-only; no API, schema, worker, or decomposition prompt changes.
- Follow `docs/design-system.md` and OKLCH tokens in `apps/web/src/app/globals.css` — no new colors.
- Do not auto-mark key-change viewed on jump.
- Chapter drill-in layout only (not Files tab, not overview cards).
- No markdown rendering in summaries/questions; no Approach A contrast redesign in this plan.
- No URL hash deep links; no multi-ref picker UI.
- File and module names must be concrete domain names (e.g. `resolve-line-ref.ts`), never `helpers` / `utils`.
- Prefer TDD: failing test → minimal implementation → pass → commit.
- Before preparing changes for push: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

**Spec:** `docs/superpowers/specs/2026-07-12-key-change-line-ref-jump-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| Create: `apps/web/src/components/review/resolve-line-ref.ts` | Pure resolve + first-valid-ref selection + stable diff row DOM id |
| Create: `apps/web/src/components/review/resolve-line-ref.test.ts` | Unit tests for resolve / select / id |
| Create: `apps/web/src/components/review/chapter-panel.test.tsx` | Checkbox vs jump click separation + notice rendering |
| Modify: `apps/web/src/components/review/chapter-panel.tsx` | Split controls; jump callback; miss notice UI |
| Modify: `apps/web/src/components/review/review-file-diff-panel.tsx` | Row `id` + jump highlight class (unified + split) |
| Modify: `apps/web/src/components/review/diff-viewer.tsx` | Accept `jumpTarget`; scroll after paint; clear after timeout |
| Modify: `apps/web/src/components/review/diff-viewer.test.ts` | Source/contract assertions for jump wiring |
| Modify: `apps/web/src/components/review/review-view.tsx` | Own jump state; uncollapse; wire panel ↔ viewer |
| Modify: `apps/web/src/components/review/review-view.test.ts` | Source assertions for jump props/handlers |

---

## Shared Types (use exactly across tasks)

```ts
// In resolve-line-ref.ts
import type { ReviewChapter, ReviewDiffLine, ReviewLineRef } from "@/lib/review-api";

export type ResolvedLineRef = {
  ref: ReviewLineRef;
  line: ReviewDiffLine;
};

export type JumpTarget = {
  chapterIndex: number;
  path: string;
  /** Resolved display line number used in the row id key (line.n). */
  lineNumber: number;
  kind: ReviewDiffLine["kind"];
  /** Bumps on every jump so re-clicking the same line restarts highlight/scroll. */
  token: number;
};

export function resolveLineRef(
  chapter: ReviewChapter,
  ref: ReviewLineRef,
): ReviewDiffLine | null;

export function selectFirstResolvableLineRef(
  chapter: ReviewChapter,
  lineRefs: ReviewLineRef[],
): ResolvedLineRef | null;

/** Stable DOM id for a diff row within a chapter file panel. */
export function diffLineElementId(
  chapterIndex: number,
  line: ReviewDiffLine,
): string;

/** Encode path the same way as filePanelId. */
export function encodeDiffPath(path: string): string;
```

```ts
// JumpTarget is also the prop shape DiffViewer receives (or null).
// ReviewView may keep JumpNotice separately:
export type JumpNotice = { message: string; token: number } | null;
```

Notice copy (Korean, exact strings for tests):

- empty refs: `이 질문에 연결된 diff 줄이 없습니다.`
- path/line miss: `연결된 diff 줄을 찾지 못했습니다.`

---

### Task 1: Resolve lineRef pure helpers

**Files:**
- Create: `apps/web/src/components/review/resolve-line-ref.ts`
- Create: `apps/web/src/components/review/resolve-line-ref.test.ts`

**Interfaces:**
- Consumes: `ReviewChapter`, `ReviewDiffLine`, `ReviewLineRef` from `@/lib/review-api`
- Produces: `resolveLineRef`, `selectFirstResolvableLineRef`, `diffLineElementId`, `encodeDiffPath`, types `ResolvedLineRef`, `JumpTarget`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/review/resolve-line-ref.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ReviewChapter, ReviewDiffLine, ReviewLineRef } from "@/lib/review-api";

import {
  diffLineElementId,
  resolveLineRef,
  selectFirstResolvableLineRef,
} from "./resolve-line-ref";

function line(partial: Partial<ReviewDiffLine> & Pick<ReviewDiffLine, "path" | "n" | "kind">): ReviewDiffLine {
  return {
    text: partial.text ?? "x",
    oldLineNumber: partial.oldLineNumber,
    newLineNumber: partial.newLineNumber,
    ...partial,
  };
}

function chapter(diffLines: ReviewDiffLine[]): ReviewChapter {
  return {
    index: 1,
    title: "t",
    summary: "s",
    files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1, viewed: false }],
    diffLines,
    keyChanges: [],
    viewed: false,
  };
}

describe("resolveLineRef", () => {
  it("matches additions on newLineNumber / n for non-del lines", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "ctx", n: 10, newLineNumber: 10 }),
      line({ path: "a.ts", kind: "add", n: 11, newLineNumber: 11 }),
    ]);
    const ref: ReviewLineRef = {
      filePath: "a.ts",
      side: "additions",
      startLine: 11,
      endLine: 11,
    };
    expect(resolveLineRef(ch, ref)).toMatchObject({ kind: "add", n: 11 });
  });

  it("matches deletions only on del lines via oldLineNumber / n", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "del", n: 5, oldLineNumber: 5 }),
      line({ path: "a.ts", kind: "add", n: 5, newLineNumber: 5 }),
    ]);
    const ref: ReviewLineRef = {
      filePath: "a.ts",
      side: "deletions",
      startLine: 5,
      endLine: 5,
    };
    expect(resolveLineRef(ch, ref)).toMatchObject({ kind: "del", n: 5 });
  });

  it("selects the first in-order match within a range", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "add", n: 3, newLineNumber: 3 }),
      line({ path: "a.ts", kind: "add", n: 4, newLineNumber: 4 }),
    ]);
    const ref: ReviewLineRef = {
      filePath: "a.ts",
      side: "additions",
      startLine: 3,
      endLine: 4,
    };
    expect(resolveLineRef(ch, ref)?.n).toBe(3);
  });

  it("returns null on miss", () => {
    const ch = chapter([line({ path: "a.ts", kind: "add", n: 1, newLineNumber: 1 })]);
    expect(
      resolveLineRef(ch, {
        filePath: "b.ts",
        side: "additions",
        startLine: 1,
        endLine: 1,
      }),
    ).toBeNull();
  });
});

describe("selectFirstResolvableLineRef", () => {
  it("skips a bad first ref and uses a later valid one", () => {
    const ch = chapter([line({ path: "a.ts", kind: "add", n: 9, newLineNumber: 9 })]);
    const result = selectFirstResolvableLineRef(ch, [
      { filePath: "missing.ts", side: "additions", startLine: 1, endLine: 1 },
      { filePath: "a.ts", side: "additions", startLine: 9, endLine: 9 },
    ]);
    expect(result?.line.n).toBe(9);
    expect(result?.ref.filePath).toBe("a.ts");
  });
});

describe("diffLineElementId", () => {
  it("encodes chapter, path, kind, and line number", () => {
    const id = diffLineElementId(
      2,
      line({ path: "pkg/a.ts", kind: "add", n: 42, newLineNumber: 42 }),
    );
    expect(id).toContain("diff-line-2-");
    expect(id).toContain("add-42");
    expect(id).not.toContain("/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @folio/web test src/components/review/resolve-line-ref.test.ts
```

Expected: FAIL — module `./resolve-line-ref` not found (or exports missing).

- [ ] **Step 3: Implement pure helpers**

Create `apps/web/src/components/review/resolve-line-ref.ts`:

```ts
import type { ReviewChapter, ReviewDiffLine, ReviewLineRef } from "@/lib/review-api";

export type ResolvedLineRef = {
  ref: ReviewLineRef;
  line: ReviewDiffLine;
};

export type JumpTarget = {
  chapterIndex: number;
  path: string;
  lineNumber: number;
  kind: ReviewDiffLine["kind"];
  token: number;
};

export function encodeDiffPath(path: string): string {
  return encodeURIComponent(path).replaceAll("%", "-");
}

export function diffLineElementId(chapterIndex: number, line: ReviewDiffLine): string {
  return `diff-line-${chapterIndex}-${encodeDiffPath(line.path)}-${line.kind}-${line.n}`;
}

function lineNumberForSide(line: ReviewDiffLine, side: ReviewLineRef["side"]): number | null {
  if (side === "deletions") {
    if (line.kind !== "del") {
      return null;
    }
    return line.oldLineNumber ?? line.n;
  }
  // additions: any non-deletion row that carries a new-side number
  if (line.kind === "del") {
    return null;
  }
  return line.newLineNumber ?? line.n;
}

export function resolveLineRef(
  chapter: ReviewChapter,
  ref: ReviewLineRef,
): ReviewDiffLine | null {
  for (const line of chapter.diffLines) {
    if (line.path !== ref.filePath) {
      continue;
    }
    const num = lineNumberForSide(line, ref.side);
    if (num === null) {
      continue;
    }
    if (num >= ref.startLine && num <= ref.endLine) {
      return line;
    }
  }
  return null;
}

export function selectFirstResolvableLineRef(
  chapter: ReviewChapter,
  lineRefs: ReviewLineRef[],
): ResolvedLineRef | null {
  for (const ref of lineRefs) {
    const line = resolveLineRef(chapter, ref);
    if (line) {
      return { ref, line };
    }
  }
  return null;
}

export function jumpTargetFromResolved(
  chapterIndex: number,
  resolved: ResolvedLineRef,
  token: number,
): JumpTarget {
  return {
    chapterIndex,
    path: resolved.line.path,
    lineNumber: resolved.line.n,
    kind: resolved.line.kind,
    token,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @folio/web test src/components/review/resolve-line-ref.test.ts
```

Expected: PASS all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add -f apps/web/src/components/review/resolve-line-ref.ts \
  apps/web/src/components/review/resolve-line-ref.test.ts
git commit -m "$(cat <<'EOF'
feat(web): resolve key-change lineRefs to diff lines

Add pure mapping and stable DOM id helpers for chapter panel jump targets.
EOF
)"
```

---

### Task 2: Split ChapterPanel checkbox vs jump + notice UI

**Files:**
- Modify: `apps/web/src/components/review/chapter-panel.tsx`
- Create: `apps/web/src/components/review/chapter-panel.test.tsx`

**Interfaces:**
- Consumes: `onJumpToKeyChange?: (keyChangeId: string) => void`, `jumpNotice?: string | null`
- Produces: Checkbox-only viewed toggle; question body calls `onJumpToKeyChange(item.id)`; notice text when `jumpNotice` set

- [ ] **Step 1: Write the failing component tests**

Create `apps/web/src/components/review/chapter-panel.test.tsx` using happy-dom/React testing pattern already used in this app (see `review-prologue.test.tsx` for render helpers). Minimal example:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import { ChapterPanel } from "./chapter-panel";

vi.mock("@/lib/review-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/review-api")>();
  return {
    ...actual,
    setKeyChangeViewed: vi.fn(async () => ({ id: "kc-1", viewed: true })),
  };
});

const chapter: ReviewChapter = {
  index: 1,
  title: "관리자 계약",
  summary: "요약",
  files: [{ path: "a.ts", status: "modified", additions: 2, deletions: 0, viewed: false }],
  diffLines: [],
  keyChanges: [
    {
      id: "kc-1",
      content: "워크스페이스 상세 응답이 안전한가요?",
      lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 1, endLine: 1 }],
      viewed: false,
    },
  ],
  viewed: false,
};

afterEach(() => {
  cleanup();
});

describe("ChapterPanel key-change controls", () => {
  it("calls onJumpToKeyChange when the question text is clicked", () => {
    const onJump = vi.fn();
    render(
      <ChapterPanel
        chapters={[chapter]}
        activeIndex={1}
        prPath="/o/r/pull/1"
        org="o"
        repo="r"
        number={1}
        onJumpToKeyChange={onJump}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "관련 diff로 이동" }));
    expect(onJump).toHaveBeenCalledWith("kc-1");
  });

  it("does not call onJumpToKeyChange when the checkbox is clicked", async () => {
    const onJump = vi.fn();
    render(
      <ChapterPanel
        chapters={[chapter]}
        activeIndex={1}
        prPath="/o/r/pull/1"
        org="o"
        repo="r"
        number={1}
        onJumpToKeyChange={onJump}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /검토 완료/ }));
    expect(onJump).not.toHaveBeenCalled();
  });

  it("renders jumpNotice near 검토할 사항", () => {
    render(
      <ChapterPanel
        chapters={[chapter]}
        activeIndex={1}
        prPath="/o/r/pull/1"
        org="o"
        repo="r"
        number={1}
        jumpNotice="연결된 diff 줄을 찾지 못했습니다."
      />,
    );
    expect(screen.getByText("연결된 diff 줄을 찾지 못했습니다.")).toBeTruthy();
  });
});
```

If `@testing-library/react` is not a dependency, use the same mount approach as `review-prologue.test.tsx` / `admin-*.test.tsx` in this repo (inspect one and match). Do **not** add a new testing library if the project already has a pattern.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @folio/web test src/components/review/chapter-panel.test.tsx
```

Expected: FAIL — missing props / single-button row still toggles only.

- [ ] **Step 3: Implement ChapterPanel control split**

In `chapter-panel.tsx`:

1. Add props:

```ts
onJumpToKeyChange?: (keyChangeId: string) => void;
jumpNotice?: string | null;
```

2. Replace the single row `<button>` with a container:

```tsx
<div
  key={item.id}
  className={cn(
    "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-5",
    item.viewed
      ? "border-primary/25 bg-primary/10 text-muted-foreground"
      : "border-border bg-background/35",
  )}
>
  <button
    type="button"
    role="checkbox"
    aria-checked={item.viewed}
    aria-label={item.viewed ? "검토 완료 해제" : "검토 완료로 표시"}
    onClick={async () => {
      /* existing setKeyChangeViewed optimistic flow */
    }}
    className={cn(
      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
      item.viewed && "border-primary bg-primary text-primary-foreground",
    )}
  >
    {item.viewed ? <Check className="size-3" /> : null}
  </button>
  <button
    type="button"
    onClick={() => onJumpToKeyChange?.(item.id)}
    className={cn(
      "min-w-0 flex-1 text-left transition-colors hover:text-primary",
      item.viewed && "line-through text-muted-foreground",
    )}
    aria-label="관련 diff로 이동"
  >
    {item.content}
  </button>
</div>
```

3. Below the `h3` 검토할 사항 (or above the list), when `jumpNotice` is truthy:

```tsx
{jumpNotice ? (
  <p className="mt-2 rounded-md border border-border bg-card px-2.5 py-2 text-muted-foreground text-xs">
    {jumpNotice}
  </p>
) : null}
```

Keep file-tree `scrollIntoView` behavior unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @folio/web test src/components/review/chapter-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/review/chapter-panel.tsx \
  apps/web/src/components/review/chapter-panel.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): split key-change checkbox and jump controls

Question body requests a lineRef jump; checkbox only toggles viewed state.
EOF
)"
```

---

### Task 3: Diff row anchors + highlight + scroll in DiffViewer

**Files:**
- Modify: `apps/web/src/components/review/review-file-diff-panel.tsx`
- Modify: `apps/web/src/components/review/diff-viewer.tsx`
- Modify: `apps/web/src/components/review/diff-viewer.test.ts`

**Interfaces:**
- Consumes: `jumpTarget: JumpTarget | null` on `DiffViewer`
- Produces: Each unified/split data row has `id={diffLineElementId(...)}`; matching jump target gets highlight class; after paint scrolls into view; parent may clear target after 2s (ReviewView) — DiffViewer must re-scroll when `token` changes

- [ ] **Step 1: Extend failing source tests**

Append to `diff-viewer.test.ts` (source-style, matching existing tests in that file):

```ts
it("accepts a jumpTarget prop for key-change navigation", () => {
  const source = readFileSync(join(import.meta.dirname, "diff-viewer.tsx"), "utf8");
  expect(source).toContain("jumpTarget");
  expect(source).toContain("diffLineElementId");
  expect(source).toContain("scrollIntoView");
});
```

Also assert `review-file-diff-panel.tsx` source contains `diffLineElementId` and a jump highlight class string such as `bg-primary/20` or `ring-1 ring-primary/40` (pick one and use it consistently in implementation).

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @folio/web test src/components/review/diff-viewer.test.ts
```

Expected: FAIL on new assertions.

- [ ] **Step 3: Add row ids + jump highlight to FileDiffPanel**

1. Import `diffLineElementId` and type `JumpTarget` from `./resolve-line-ref`.
2. Add optional props to `FileDiffPanel`:

```ts
chapterIndex: number; // already present
jumpTarget?: JumpTarget | null;
```

3. Helper inside the panel file:

```ts
function isJumpLine(target: JumpTarget | null | undefined, line: ReviewDiffLine, chapterIndex: number): boolean {
  if (!target || target.chapterIndex !== chapterIndex) return false;
  return (
    target.path === line.path &&
    target.kind === line.kind &&
    target.lineNumber === line.n
  );
}
```

4. **Unified** `<tr>`:
   - `id={diffLineElementId(chapterIndex, line)}`
   - add class when `isJumpLine(jumpTarget, line, chapterIndex)`:
     `bg-primary/20 ring-1 ring-inset ring-primary/40`

5. **Split** mode: put `id` on the `<tr>` when either side matches; if only one side matches, still id that row using the matching line. Prefer:

```ts
const anchorLine = row.oldLine && isJumpLine(...) ? row.oldLine
  : row.newLine && isJumpLine(...) ? row.newLine
  : row.newLine ?? row.oldLine;
// id from anchorLine when present
```

Highlight the whole split `<tr>` when either side is the jump target.

Pass `jumpTarget` from `DiffViewer` into each `FileDiffPanel`.

- [ ] **Step 4: Scroll on jumpTarget in DiffViewer**

In `diff-viewer.tsx`:

```ts
import { useEffect } from "react"; // already imported
import { diffLineElementId, type JumpTarget } from "./resolve-line-ref";

// props:
jumpTarget?: JumpTarget | null;

// inside component:
useEffect(() => {
  if (!jumpTarget || jumpTarget.chapterIndex !== chapter.index) {
    return;
  }
  const line = chapter.diffLines.find(
    (entry) =>
      entry.path === jumpTarget.path &&
      entry.kind === jumpTarget.kind &&
      entry.n === jumpTarget.lineNumber,
  );
  if (!line) {
    return;
  }
  const id = diffLineElementId(chapter.index, line);
  let cancelled = false;
  const frame = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (cancelled) return;
      document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}, [jumpTarget, chapter]);
```

Do **not** clear `jumpTarget` inside DiffViewer — parent owns the 2s timer.

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @folio/web test src/components/review/diff-viewer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/review/review-file-diff-panel.tsx \
  apps/web/src/components/review/diff-viewer.tsx \
  apps/web/src/components/review/diff-viewer.test.ts
git commit -m "$(cat <<'EOF'
feat(web): anchor and highlight diff lines for key-change jumps

Add stable row ids, jump highlight styling, and post-paint scrollIntoView.
EOF
)"
```

---

### Task 4: Wire ReviewView jump orchestration

**Files:**
- Modify: `apps/web/src/components/review/review-view.tsx`
- Modify: `apps/web/src/components/review/review-view.test.ts`

**Interfaces:**
- Consumes: `selectFirstResolvableLineRef`, `jumpTargetFromResolved`, `filePanelId`, `setFilePathsCollapsed`
- Produces: End-to-end jump from panel → expand → DiffViewer target; miss notice + optional file header scroll; clear on chapter change; 2s highlight clear; 3s notice clear

- [ ] **Step 1: Write failing source tests in `review-view.test.ts`**

Add assertions that `review-view.tsx` source contains:

- `onJumpToKeyChange`
- `jumpTarget`
- `selectFirstResolvableLineRef`
- notice strings `이 질문에 연결된 diff 줄이 없습니다.` and `연결된 diff 줄을 찾지 못했습니다.`
- `JUMP_HIGHLIGHT_MS` or literal `2000` near jump clear logic

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @folio/web test src/components/review/review-view.test.ts
```

Expected: FAIL until wiring exists.

- [ ] **Step 3: Implement ReviewView handlers**

Near other state in `review-view.tsx`:

```ts
import {
  jumpTargetFromResolved,
  selectFirstResolvableLineRef,
  type JumpTarget,
} from "./resolve-line-ref";
import { filePanelId, setFilePathsCollapsed } from "./review-file-state";

const JUMP_HIGHLIGHT_MS = 2000;
const JUMP_NOTICE_MS = 3000;

const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
const [jumpNotice, setJumpNotice] = useState<string | null>(null);
const jumpTokenRef = useRef(0);

useEffect(() => {
  setJumpTarget(null);
  setJumpNotice(null);
}, [openIndex]);

useEffect(() => {
  if (!jumpTarget) return;
  const timer = window.setTimeout(() => setJumpTarget(null), JUMP_HIGHLIGHT_MS);
  return () => window.clearTimeout(timer);
}, [jumpTarget]);

useEffect(() => {
  if (!jumpNotice) return;
  const timer = window.setTimeout(() => setJumpNotice(null), JUMP_NOTICE_MS);
  return () => window.clearTimeout(timer);
}, [jumpNotice]);

function handleJumpToKeyChange(keyChangeId: string) {
  if (!openChapter) return;
  const keyChange = openChapter.keyChanges.find((item) => item.id === keyChangeId);
  if (!keyChange) return;

  if (keyChange.lineRefs.length === 0) {
    setJumpNotice("이 질문에 연결된 diff 줄이 없습니다.");
    setJumpTarget(null);
    return;
  }

  const resolved = selectFirstResolvableLineRef(openChapter, keyChange.lineRefs);
  if (!resolved) {
    setJumpNotice("연결된 diff 줄을 찾지 못했습니다.");
    setJumpTarget(null);
    const fallbackPath =
      keyChange.lineRefs.find((ref) =>
        openChapter.files.some((file) => file.path === ref.filePath),
      )?.filePath ?? null;
    if (fallbackPath) {
      setCollapsedFiles((current) => setFilePathsCollapsed(current, [fallbackPath], false));
      requestAnimationFrame(() => {
        document
          .getElementById(filePanelId(openChapter.index, fallbackPath))
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
    return;
  }

  setJumpNotice(null);
  jumpTokenRef.current += 1;
  const token = jumpTokenRef.current;
  setCollapsedFiles((current) =>
    setFilePathsCollapsed(current, [resolved.line.path], false),
  );
  setJumpTarget(jumpTargetFromResolved(openChapter.index, resolved, token));
}
```

Wire props only on the chapter drill-in branch:

```tsx
<DiffViewer
  chapter={openChapter}
  collapsedFiles={collapsedFiles}
  viewMode={diffViewMode}
  jumpTarget={jumpTarget}
  onFileViewedChange={updateFileViewed}
  onFileCollapseChange={updateFileCollapsed}
  commentContext={{ /* unchanged */ }}
/>
<ChapterPanel
  /* existing props */
  onKeyChangeViewedChange={updateKeyChangeViewed}
  onJumpToKeyChange={handleJumpToKeyChange}
  jumpNotice={jumpNotice}
/>
```

Import `useRef` from React.

- [ ] **Step 4: Run focused tests**

```bash
pnpm --filter @folio/web test src/components/review/resolve-line-ref.test.ts \
  src/components/review/chapter-panel.test.tsx \
  src/components/review/diff-viewer.test.ts \
  src/components/review/review-view.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Typecheck web**

```bash
pnpm --filter @folio/web typecheck
```

Expected: no errors related to jump props.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/review/review-view.tsx \
  apps/web/src/components/review/review-view.test.ts
git commit -m "$(cat <<'EOF'
feat(web): wire key-change lineRef jump through review view

Own jump target and notice state, uncollapse target files, and connect panel to diff viewer.
EOF
)"
```

---

### Task 5: Verification gate

**Files:** none new (run commands only; fix only if gate fails within this feature’s scope)

- [ ] **Step 1: Run web package tests for review components**

```bash
pnpm --filter @folio/web test src/components/review/
```

Expected: PASS.

- [ ] **Step 2: Run repo lint / typecheck for touched surface**

```bash
pnpm --filter @folio/web typecheck
pnpm exec oxlint apps/web/src/components/review/resolve-line-ref.ts \
  apps/web/src/components/review/chapter-panel.tsx \
  apps/web/src/components/review/diff-viewer.tsx \
  apps/web/src/components/review/review-file-diff-panel.tsx \
  apps/web/src/components/review/review-view.tsx
```

Expected: clean (or only pre-existing unrelated issues).

- [ ] **Step 3: Manual smoke (if local app available)**

1. Open a PR chapter with keyChanges that have valid lineRefs.
2. Click question text → file expands if needed, line scrolls into view, brief green/primary highlight ~2s.
3. Click checkbox only → viewed toggles, no scroll.
4. Click a question with bad refs → notice appears; if path exists, file header scrolls.
5. Toggle unified/split → jump still works.

- [ ] **Step 4: Final commit only if fixes were needed**

```bash
git add -A apps/web/src/components/review
git commit -m "$(cat <<'EOF'
fix(web): polish key-change lineRef jump edge cases

Address verification findings for jump highlight, notice, and control split.
EOF
)"
```

If nothing to fix, skip this commit.

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Checkbox = viewed only | Task 2 |
| Question body = jump | Task 2 + 4 |
| First valid lineRef only | Task 1 `selectFirstResolvableLineRef` + Task 4 |
| Uncollapse before scroll | Task 4 |
| ~2s highlight, token refresh | Task 3–4 |
| Miss notice + file header fallback | Task 2 UI + Task 4 handler |
| Chapter drill-in only | Task 4 wires only openChapter branch |
| Pure resolve mapping add/del/range | Task 1 |
| Stable row id from resolved line | Task 1 id + Task 3 |
| No API/backend | All tasks frontend |
| Tests for resolve, panel, viewer, view | Tasks 1–4 |

**Placeholder scan:** no TBD/TODO steps; concrete code and commands included.

**Type consistency:** `JumpTarget` / `ResolvedLineRef` / notice strings shared as defined in Shared Types and Task 1 exports.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-key-change-line-ref-jump.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
