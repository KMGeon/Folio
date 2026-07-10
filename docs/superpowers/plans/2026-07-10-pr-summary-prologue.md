# PR Summary Prologue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each PR's stored generated prologue as a four-section Summary tab with a safe optional Mermaid visualization while preserving Description and Comments fallbacks.

**Architecture:** Validate the latest revision's existing `prologue` JSON at the backend read boundary and add it to the typed review payload. Pass the typed value through both Next.js review routes into focused `ReviewSummary` and client-only `MermaidDiagram` components; invalid or missing data falls back without making the review unavailable.

**Tech Stack:** pnpm workspace, TypeScript ESM, NestJS, Zod, Next.js 15 App Router, React 19, Tailwind CSS 4, Vitest, Mermaid 11.

## Global Constraints

- Preserve this exact section order: `Why this PR?`, `What it does`, `Key changes`, `Review focus`.
- Render Mermaid only when `prologue.diagram` is present.
- Keep tabs in `Summary`, `Description`, `Comments` order; hide Summary and default to Description when `prologue` is null.
- Do not regenerate or backfill prologues and do not add a database migration.
- Parse with `PrologueSchema.safeParse`; invalid JSON becomes `prologue: null` without failing the review.
- Configure Mermaid with `startOnLoad: false`, `securityLevel: "strict"`, a 20,000-character source limit, no callbacks, and no external links.
- Use `@folio/types` as the shared type source.
- Follow `docs/design-system.md` and `apps/web/src/app/globals.css`; add no raw colors, font sizes, or shadow tiers.
- Preserve the overview grid, chapter drill-in, Description markdown, and GitHub Comments behavior.
- Never add a `max-lines` disable and never bypass git hooks.
- Final verification must pass `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

## File and Responsibility Map

- Backend read model, facade, and facade test own validation and API exposure.
- Web API type/test and both pull-request pages own transport plumbing.
- `review-view.tsx` forwards the typed prologue.
- `review-prologue.tsx` owns tabs and initial fallback.
- New `review-summary.tsx` owns the four sections.
- New `mermaid-diagram.tsx` owns guarded lazy rendering and isolated errors.
- Focused tests cover mapping, fallback, source guards, and route plumbing.
- `apps/web/package.json` and `pnpm-lock.yaml` declare shared types and Mermaid.

## DAG Overview

| Task | Dependencies | Wave | Worktree | Role |
| --- | --- | --- | --- | --- |
| `backend-prologue` | none | wave-1 | inter-worktree | implementer |
| `frontend-summary` | none | wave-1 | inter-worktree | implementer |
| `backend-spec-review` | backend-prologue | wave-2 | intra-worktree | spec-reviewer |
| `frontend-spec-review` | frontend-summary | wave-2 | intra-worktree | spec-reviewer |
| `backend-quality-review` | backend-spec-review | wave-3 | intra-worktree | quality-reviewer |
| `frontend-quality-review` | frontend-spec-review | wave-3 | intra-worktree | quality-reviewer |
| `integrate-approved` | both quality reviews | wave-4 | coordinator-only | verifier |
| `final-verification` | integrate-approved | wave-5 | intra-worktree | verifier |

Wave-1 tasks share no files. A failed review creates a scoped fix task in the same worktree, followed by the failed and downstream reviews.

---

### Task 1: Backend Prologue Read Contract

```yaml
dag:
  id: "backend-prologue"
  purpose: "Validate stored prologue and expose it without failing malformed reviews."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/backend/src/domain/review/review-read-model.ts"
      - "apps/backend/src/application/review/review-read.facade.ts"
      - "apps/backend/src/application/review/review-read.facade.test.ts"
    modules: ["@folio/backend", "@folio/types"]
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- review-read.facade.test.ts"
      - "pnpm --filter @folio/backend typecheck"
    expected: "Focused tests pass and backend typecheck reports zero errors."
  risk:
    collision: "low"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only DB behavior; invalid content must not be logged."
  handoff_payload:
    include_spec_sections: ["Data Flow and Contracts", "Error Handling", "Testing / Backend"]
    include_plan_sections: ["Task 1: Backend Prologue Read Contract"]
```

**Interfaces:** consumes `revision.prologue: unknown`; produces `ReviewPayload.prologue: Prologue | null`.

- [ ] **Step 1: Write failing valid, legacy, null, and invalid-data tests**

Add a legacy object without `diagram` to the default revision mock:

```ts
const storedPrologue = {
  motivation: "리뷰 흐름을 더 빠르게 이해하기 위해 변경합니다.",
  outcome: "PR 전체 요약과 검토 지점을 한 화면에서 확인합니다.",
  keyChanges: [
    { summary: "PR 요약 노출", description: "저장된 총정리를 리뷰 화면에 전달합니다." },
    { summary: "안전한 폴백", description: "잘못된 총정리는 기존 설명 화면으로 전환합니다." },
  ],
  focusAreas: [{
    type: "architecture",
    severity: "medium",
    title: "API 계약",
    description: "저장 데이터와 응답 계약이 일치하는지 확인하세요.",
    locations: ["apps/backend/src/application/review/review-read.facade.ts"],
  }],
  complexity: { level: "medium", reasoning: "백엔드와 웹 계약이 함께 바뀝니다." },
};
```

Add `prologue: storedPrologue` to `latestForPr`, then assert:

```ts
expect(payload?.prologue).toEqual({ ...storedPrologue, diagram: null });
```

Add focused overrides:

```ts
it("returns null for invalid stored prologue without failing review", async () => {
  const db = await import("@folio/db");
  vi.mocked(db.revisionsRepo.latestForPr).mockResolvedValueOnce({
    id: "rev-invalid", rawDiff: "", prologue: { complexity: { level: "extreme" } },
  } as never);
  const payload = await new ReviewReadFacade().getReview("acme", "widget", 7, "user1");
  expect(payload).not.toBeNull();
  expect(payload?.prologue).toBeNull();
});

it("returns null when no prologue is stored", async () => {
  const db = await import("@folio/db");
  vi.mocked(db.revisionsRepo.latestForPr).mockResolvedValueOnce({
    id: "rev-null", rawDiff: "", prologue: null,
  } as never);
  const payload = await new ReviewReadFacade().getReview("acme", "widget", 7, "user1");
  expect(payload?.prologue).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --filter @folio/backend test -- review-read.facade.test.ts`

Expected: FAIL because the payload does not expose prologue.

- [ ] **Step 3: Add the shared read-model field**

```ts
import type { FileStatus, LineRef, Prologue } from "@folio/types";

export interface ReviewPayload {
  pr: ReviewPrMeta;
  prologue: Prologue | null;
  chapters: ReviewChapter[];
  comments: ReviewIssueComment[];
  commits: ReviewCommit[];
  commitsTruncated: boolean;
}
```

- [ ] **Step 4: Validate at the read boundary**

```ts
function parseStoredPrologue(
  value: unknown,
  revisionId: string,
  logger: Logger,
): Prologue | null {
  if (value === null || value === undefined) return null;
  const parsed = PrologueSchema.safeParse(value);
  if (!parsed.success) {
    // Stored model output is not trusted blindly; keep the review readable.
    logger.warn(`Ignoring invalid prologue for revision ${revisionId}`);
    return null;
  }
  return parsed.data;
}
```

After the revision null check compute `const prologue = parseStoredPrologue(...)` and add `prologue` after `pr` in the result. Keep the parser in this facade rather than a generic utility module.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @folio/backend test -- review-read.facade.test.ts
pnpm --filter @folio/backend typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/domain/review/review-read-model.ts apps/backend/src/application/review/review-read.facade.ts apps/backend/src/application/review/review-read.facade.test.ts
git commit -m "feat(review): expose validated PR prologue"
```

---

### Task 2: Frontend Summary and Mermaid Experience

```yaml
dag:
  id: "frontend-summary"
  purpose: "Wire and render Summary with a safe optional Mermaid diagram."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/web/package.json"
      - "pnpm-lock.yaml"
      - "apps/web/src/lib/review-api.ts"
      - "apps/web/src/lib/review-api.test.ts"
      - "apps/web/src/app/[org]/[repo]/pull/[number]/page.tsx"
      - "apps/web/src/app/[org]/[repo]/pull/[number]/chapters/[index]/page.tsx"
      - "apps/web/src/components/review/review-view.tsx"
      - "apps/web/src/components/review/review-view.test.ts"
      - "apps/web/src/components/review/review-prologue.tsx"
      - "apps/web/src/components/review/review-prologue.test.tsx"
      - "apps/web/src/components/review/review-summary.tsx"
      - "apps/web/src/components/review/mermaid-diagram.tsx"
      - "apps/web/src/components/review/mermaid-diagram.test.ts"
      - "apps/web/src/components/review/review-loading-skeleton.tsx"
    modules: ["@folio/web", "@folio/types", "mermaid"]
  verification:
    commands:
      - "pnpm --filter @folio/web test -- review-prologue.test.tsx mermaid-diagram.test.ts review-view.test.ts review-api.test.ts"
      - "pnpm --filter @folio/web typecheck"
      - "pnpm --filter @folio/web build"
    expected: "Focused tests, typecheck, and production build pass."
  risk:
    collision: "medium"
    external_write: false
    database: false
    deployment: false
    notes: "Generated Mermaid is untrusted display data."
  handoff_payload:
    include_spec_sections: ["Web Component Boundaries", "Summary Information Design", "Layout and Visual Rules", "Mermaid Rendering and Safety", "Error Handling", "Testing / Frontend"]
    include_plan_sections: ["Task 2: Frontend Summary and Mermaid Experience"]
```

**Interfaces:** consumes `ReviewPayload.prologue`; produces prologue props, `ReviewSummary`, and `MermaidDiagram`.

- [ ] **Step 1: Declare dependencies**

Run: `pnpm --filter @folio/web add '@folio/types@workspace:*' 'mermaid@^11.16.0'`

Expected: manifest and lockfile update without peer errors.

- [ ] **Step 2: Write failing Summary/fallback tests**

Create `review-prologue.test.tsx` using `renderToStaticMarkup`. Use a complete `ReviewPrMeta` and this prologue:

```ts
const prologue: Prologue = {
  motivation: "리뷰 배경을 먼저 이해해야 합니다.",
  outcome: "총정리와 흐름도를 한 화면에서 제공합니다.",
  diagram: "flowchart LR\nA[Diff] --> B[Summary]",
  keyChanges: [{ summary: "총정리 추가", description: "구조화 데이터를 표시합니다." }],
  focusAreas: [{
    type: "architecture", severity: "high", title: "렌더링 경계",
    description: "렌더링 실패가 격리되는지 확인하세요.",
    locations: ["apps/web/src/components/review/mermaid-diagram.tsx"],
  }],
  complexity: { level: "high", reasoning: "API와 브라우저 렌더링이 함께 바뀝니다." },
};
```

Assert that a non-null prologue initially renders all four labels and motivation but not the original PR body. Assert that null omits the Summary button and initially renders Description plus Comments 0.

- [ ] **Step 3: Write failing Mermaid and route tests**

Create `mermaid-diagram.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mermaidSourceError } from "./mermaid-diagram.js";

const source = readFileSync(resolve(__dirname, "mermaid-diagram.tsx"), "utf8");
it("guards input", () => {
  expect(mermaidSourceError("flowchart LR\nA-->B")).toBeNull();
  expect(mermaidSourceError("   ")).toBe("empty");
  expect(mermaidSourceError("x".repeat(20_001))).toBe("too-large");
});
it("uses strict lazy rendering and catches failures", () => {
  expect(source).toContain('securityLevel: "strict"');
  expect(source).toContain("startOnLoad: false");
  expect(source).toContain('await import("mermaid")');
  expect(source).toContain("catch");
});
```

Extend `review-view.test.ts` to read both page files and assert `prologue={review.prologue}` in each, `prologue: Prologue | null` in ReviewView, and `<ReviewPrologue pr={pr} prologue={prologue}`. Add `prologue: null` to `review-api.test.ts`.

- [ ] **Step 4: Run tests and confirm failure**

Run: `pnpm --filter @folio/web test -- review-prologue.test.tsx mermaid-diagram.test.ts review-view.test.ts review-api.test.ts`

Expected: FAIL because props and components are absent.

- [ ] **Step 5: Add typed transport plumbing**

Import `Prologue` in `review-api.ts` and add `prologue: Prologue | null` after `pr`. Pass it from both pages. Add the same required prop to ReviewView and forward:

```tsx
<ReviewPrologue pr={pr} prologue={prologue} comments={comments} />
```

- [ ] **Step 6: Implement the four sections**

Create `review-summary.tsx`. Define token-only complexity/severity class records. Define local `SummarySection` taking `LucideIcon`, title, and children. Render an article with these first sections:

```tsx
<SummarySection icon={GitPullRequestArrow} title="Why this PR?">
  <p className={cn("text-sm leading-6", !prologue.motivation && "text-muted-foreground")}>
    {prologue.motivation ?? "변경 내용에서 명확히 확인되지 않았습니다."}
  </p>
</SummarySection>
<SummarySection icon={Braces} title="What it does">
  <p className={cn("text-sm leading-6", !prologue.outcome && "text-muted-foreground")}>
    {prologue.outcome ?? "변경 내용에서 명확히 확인되지 않았습니다."}
  </p>
  {prologue.diagram ? <MermaidDiagram source={prologue.diagram} label="PR 변경 흐름도" /> : null}
</SummarySection>
```

Key changes maps ordered entries to border-left rows with summary and muted description; empty copy is `핵심 변경이 제공되지 않았습니다.` Review focus shows complexity badge/reasoning then ordered focus cards with severity, title, description, and mono location pills; empty copy is `별도 검토 지점이 제공되지 않았습니다.`

- [ ] **Step 7: Implement strict Mermaid rendering**

Create `mermaid-diagram.tsx` with:

```tsx
"use client";
const MAX_MERMAID_SOURCE_LENGTH = 20_000;
export function mermaidSourceError(source: string): "empty" | "too-large" | null {
  if (!source.trim()) return "empty";
  if (source.length > MAX_MERMAID_SOURCE_LENGTH) return "too-large";
  return null;
}
```

In a `useEffect`, reject guarded input, dynamically `await import("mermaid")`, read computed Folio CSS variables, and initialize:

```ts
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
  themeVariables: {
    background: styles.getPropertyValue("--card").trim(),
    primaryColor: styles.getPropertyValue("--muted").trim(),
    primaryTextColor: styles.getPropertyValue("--foreground").trim(),
    primaryBorderColor: styles.getPropertyValue("--border").trim(),
    lineColor: styles.getPropertyValue("--muted-foreground").trim(),
  },
});
```

Use `useId`, remove colons for a unique render id, and an `active` cleanup flag. Catch all render errors into a diagram-only Korean error card. Loading renders an `aria-busy` skeleton. Ready renders strict Mermaid SVG in a `role="img"`/`aria-label` div with horizontal overflow and token classes.

If Mermaid 11.16.0 rejects `maxTextSize` in its exact type, retain the explicit 20,000-character guard and remove only that duplicate property. Never loosen strict mode.

- [ ] **Step 8: Add conditional Summary tabs**

Change the union to `"summary" | "description" | "comments"` and initialize with `prologue ? "summary" : "description"`. Render Summary before Description only when non-null. Use:

```tsx
{tab === "summary" && prologue ? (
  <ReviewSummary prologue={prologue} />
) : tab === "description" ? (
  <ConversationCard author={pr.author} createdLabel="PR description">
    <MarkdownText text={pr.body || "PR 설명이 없습니다."} />
  </ConversationCard>
) : commentsContent}
```

Set `commentsContent` immediately above the return statement to the current comments `<div>` JSX verbatim. This is a local JSX constant, not a new component; it preserves the current list, empty state, links, and date formatting without duplicating them.

- [ ] **Step 9: Align fixture and skeleton**

Add `prologue: null` to the API fixture. Make the prologue skeleton tab row contain three compact blocks, without changing column widths.

- [ ] **Step 10: Verify**

Run:

```bash
pnpm --filter @folio/web test -- review-prologue.test.tsx mermaid-diagram.test.ts review-view.test.ts review-api.test.ts
pnpm --filter @folio/web typecheck
pnpm --filter @folio/web build
```

Expected: tests PASS, typecheck exits 0, Next.js builds successfully.

- [ ] **Step 11: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/review-api.ts apps/web/src/lib/review-api.test.ts 'apps/web/src/app/[org]/[repo]/pull/[number]/page.tsx' 'apps/web/src/app/[org]/[repo]/pull/[number]/chapters/[index]/page.tsx' apps/web/src/components/review
git commit -m "feat(web): add generated PR summary"
```

---

### Task 3: Backend Spec Review

```yaml
dag:
  id: "backend-spec-review"
  purpose: "Verify backend contract and fallback behavior."
  deps: ["backend-prologue"]
  parallel_group: "wave-2"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files: ["apps/backend/src/domain/review/review-read-model.ts", "apps/backend/src/application/review/review-read.facade.ts", "apps/backend/src/application/review/review-read.facade.test.ts"]
    modules: ["@folio/backend"]
  verification:
    commands: ["pnpm --filter @folio/backend test -- review-read.facade.test.ts"]
    expected: "Tests pass and review returns PASS or exact defects."
  risk: { collision: "none", external_write: false, database: false, deployment: false, notes: "Read-only." }
  handoff_payload:
    include_spec_sections: ["Goals", "Data Flow and Contracts", "Error Handling"]
    include_plan_sections: ["Task 1"]
```

- [ ] Confirm null does not warn, invalid data warns without content, missing diagram defaults null, and no migration exists.
- [ ] Run the command and return PASS or file/line defects.

### Task 4: Frontend Spec Review

```yaml
dag:
  id: "frontend-spec-review"
  purpose: "Verify layout, tabs, Mermaid, and fallbacks."
  deps: ["frontend-summary"]
  parallel_group: "wave-2"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files: ["apps/web/package.json", "pnpm-lock.yaml", "apps/web/src/lib/review-api.ts", "apps/web/src/components/review/review-view.tsx", "apps/web/src/components/review/review-prologue.tsx", "apps/web/src/components/review/review-summary.tsx", "apps/web/src/components/review/mermaid-diagram.tsx"]
    modules: ["@folio/web"]
  verification:
    commands: ["pnpm --filter @folio/web test -- review-prologue.test.tsx mermaid-diagram.test.ts review-view.test.ts review-api.test.ts"]
    expected: "Tests pass and review returns PASS or exact defects."
  risk: { collision: "none", external_write: false, database: false, deployment: false, notes: "SVG boundary is safety-critical." }
  handoff_payload:
    include_spec_sections: ["Web Component Boundaries", "Summary Information Design", "Mermaid Rendering and Safety"]
    include_plan_sections: ["Task 2"]
```

- [ ] Confirm exact ordering, fallback, lazy strict import, source limit, error isolation, accessible label, and token styling.
- [ ] Confirm Description, Comments, drill-in, and grid remain intact.
- [ ] Run tests and return PASS or exact defects.

### Task 5: Backend Quality Review

```yaml
dag:
  id: "backend-quality-review"
  purpose: "Check backend boundaries, logging, types, and tests."
  deps: ["backend-spec-review"]
  parallel_group: "wave-3"
  worktree_strategy: "intra-worktree"
  worker_role: "quality-reviewer"
  scope:
    files: ["apps/backend/src/domain/review/review-read-model.ts", "apps/backend/src/application/review/review-read.facade.ts", "apps/backend/src/application/review/review-read.facade.test.ts"]
    modules: ["@folio/backend"]
  verification:
    commands: ["pnpm --filter @folio/backend typecheck", "pnpm --filter @folio/backend test -- review-read.facade.test.ts"]
    expected: "Commands pass with no critical or important defects."
  risk: { collision: "none", external_write: false, database: false, deployment: false, notes: "Read-only." }
  handoff_payload:
    include_spec_sections: ["Data Flow and Contracts", "Error Handling"]
    include_plan_sections: ["Task 1"]
```

- [ ] Inspect type safety, logging, naming, error boundary, and test isolation.
- [ ] Run commands and return PASS or ranked exact defects.

### Task 6: Frontend Quality Review

```yaml
dag:
  id: "frontend-quality-review"
  purpose: "Check Mermaid safety, lifecycle, accessibility, tokens, and tests."
  deps: ["frontend-spec-review"]
  parallel_group: "wave-3"
  worktree_strategy: "intra-worktree"
  worker_role: "quality-reviewer"
  scope:
    files: ["apps/web/package.json", "pnpm-lock.yaml", "apps/web/src/lib/review-api.ts", "apps/web/src/lib/review-api.test.ts", "apps/web/src/app/[org]/[repo]/pull/[number]/page.tsx", "apps/web/src/app/[org]/[repo]/pull/[number]/chapters/[index]/page.tsx", "apps/web/src/components/review/review-view.tsx", "apps/web/src/components/review/review-view.test.ts", "apps/web/src/components/review/review-prologue.tsx", "apps/web/src/components/review/review-prologue.test.tsx", "apps/web/src/components/review/review-summary.tsx", "apps/web/src/components/review/mermaid-diagram.tsx", "apps/web/src/components/review/mermaid-diagram.test.ts", "apps/web/src/components/review/review-loading-skeleton.tsx"]
    modules: ["@folio/web"]
  verification:
    commands: ["pnpm --filter @folio/web typecheck", "pnpm --filter @folio/web test -- review-prologue.test.tsx mermaid-diagram.test.ts review-view.test.ts review-api.test.ts"]
    expected: "Commands pass with no critical or important defects."
  risk: { collision: "none", external_write: false, database: false, deployment: false, notes: "Never loosen Mermaid security." }
  handoff_payload:
    include_spec_sections: ["Layout and Visual Rules", "Mermaid Rendering and Safety", "Error Handling"]
    include_plan_sections: ["Task 2"]
```

- [ ] Inspect cleanup, stale state, ids, SVG insertion, limits, semantics, accessibility, and overflow.
- [ ] Confirm focused files and no lint bypass.
- [ ] Run commands and return PASS or ranked exact defects.

### Task 7: Integrate Approved Commits

```yaml
dag:
  id: "integrate-approved"
  purpose: "Integrate only commits that passed both reviews."
  deps: ["backend-quality-review", "frontend-quality-review"]
  parallel_group: "wave-4"
  worktree_strategy: "coordinator-only"
  worker_role: "verifier"
  scope: { files: [], modules: ["repository integration"] }
  verification:
    commands: ["git status --short", "git log --oneline --max-count=5"]
    expected: "Worktree is clean and both reviewed commits appear once."
  risk: { collision: "medium", external_write: false, database: false, deployment: false, notes: "Any conflict is a decision gate." }
  handoff_payload:
    include_spec_sections: ["Goals"]
    include_plan_sections: ["DAG Overview"]
```

- [ ] Confirm both PASS payloads for each implementation.
- [ ] Cherry-pick backend then frontend commits.
- [ ] Stop on conflicts and verify clean status.

### Task 8: Whole-Change Verification and Visual QA

```yaml
dag:
  id: "final-verification"
  purpose: "Run repository suite and responsive visual QA."
  deps: ["integrate-approved"]
  parallel_group: "wave-5"
  worktree_strategy: "intra-worktree"
  worker_role: "verifier"
  scope:
    files: ["apps/backend/src/domain/review/review-read-model.ts", "apps/backend/src/application/review/review-read.facade.ts", "apps/backend/src/application/review/review-read.facade.test.ts", "apps/web/package.json", "pnpm-lock.yaml", "apps/web/src/lib/review-api.ts", "apps/web/src/lib/review-api.test.ts", "apps/web/src/app/[org]/[repo]/pull/[number]/page.tsx", "apps/web/src/app/[org]/[repo]/pull/[number]/chapters/[index]/page.tsx", "apps/web/src/components/review/review-view.tsx", "apps/web/src/components/review/review-view.test.ts", "apps/web/src/components/review/review-prologue.tsx", "apps/web/src/components/review/review-prologue.test.tsx", "apps/web/src/components/review/review-summary.tsx", "apps/web/src/components/review/mermaid-diagram.tsx", "apps/web/src/components/review/mermaid-diagram.test.ts", "apps/web/src/components/review/review-loading-skeleton.tsx"]
    modules: ["@folio/backend", "@folio/web", "repository root"]
  verification:
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build"]
    expected: "All commands exit 0 and visual QA confirms required behavior."
  risk: { collision: "none", external_write: false, database: false, deployment: false, notes: "Missing visual credentials opens a decision gate." }
  handoff_payload:
    include_spec_sections: ["Goals", "Layout and Visual Rules", "Mermaid Rendering and Safety", "Testing"]
    include_plan_sections: ["Task 8"]
```

- [ ] Run all four root commands; each must exit 0.
- [ ] Start existing dev profiles without creating or revealing credentials.
- [ ] At desktop width verify Summary default, four-section order, contained Mermaid, and usable Description/Comments.
- [ ] At narrow width verify stacking, wrapping, contained paths, and horizontal diagram scrolling.
- [ ] Verify null prologue omits Summary and defaults Description.
- [ ] If visual cases require unavailable credentials or external writes, report automated results and open the required decision gate.
- [ ] Record exact results and observations.

---

## Conditional Fix and Re-Review Contract

For a review defect, create a fix task in the original worktree. Scope only affected files, include exact defects, add a failing regression test for behavior changes, run original focused commands, commit, then rerun the failed and downstream reviews. Never integrate unresolved critical or important findings.

## Dispatch Gate Summary

**Dispatch Gate**

Spec: `docs/superpowers/specs/2026-07-10-pr-summary-prologue-design.md`
Plan: `docs/superpowers/plans/2026-07-10-pr-summary-prologue.md`

Waves:

- wave-1: backend-prologue and frontend-summary in separate inter-worktrees
- wave-2: both spec reviews
- wave-3: both quality reviews after spec PASS
- wave-4: coordinator-only integration
- wave-5: final verification

Risks:

- Generated Mermaid is untrusted; strict mode, a source guard, cleanup, and isolated errors contain it.
- Mermaid changes dependencies; dynamic import and production build verification guard regressions.
- Wave-1 files do not overlap; any conflict stops at a decision gate.

Verification:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` must exit 0.
- Browser QA must confirm tab fallback and responsive diagram behavior.

Decision gates:

- Stop for overlapping edits or conflicts.
- Stop if repeated verification failure makes the design ambiguous.
- Stop before database, production-data, deployment, credential, or external API writes.
- Stop if visual verification requires unavailable credentials or external state.

Approve worker dispatch?
