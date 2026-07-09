# Dashboard Board Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dashboard board that groups open PRs by review relevance and shows recently merged/closed PRs from GitHub.

**Architecture:** Keep `GET /api/v1/dashboard` as the single data source. Extend the backend payload with open PR line counts and a capped `completedPulls` list, then replace the frontend dashboard's metric/repository layout with server-rendered board components.

**Tech Stack:** pnpm workspace, TypeScript ESM, NestJS backend, Next.js App Router frontend, Vitest, lucide-react, Tailwind tokens from `apps/web/src/app/globals.css`.

## Global Constraints

- Folio is dark-mode only; use existing design tokens and no raw hex/OKLCH colors in components.
- API responses must continue to use the existing dashboard endpoint and common response envelope.
- Runtime profiles stay explicit: backend `APP_PROFILE=dev|prd`, frontend `NEXT_PUBLIC_APP_PROFILE=dev|prd`.
- Do not commit real `.env`, `.env.dev`, or `.env.prd` files.
- Never add a `max-lines` lint disable.
- Do not bypass pre-commit hooks with `--no-verify`.
- Keep repository enable/disable management out of the redesigned dashboard.
- Search/filter controls are presentational only in this implementation.

---

## File Structure

- Modify `apps/backend/src/application/dashboard/dashboard.facade.ts`
  - Owns dashboard data contract, GitHub open/closed PR fetching, PR detail enrichment, and sorting/capping completed pulls.
- Modify `apps/backend/src/application/dashboard/dashboard.facade.test.ts`
  - Owns backend behavior tests for open pull preservation, completed state mapping, sort/cap behavior, and isolated GitHub failures.
- Modify `apps/web/src/lib/dashboard-api.ts`
  - Mirrors the backend dashboard payload contract for the Next.js app.
- Create `apps/web/src/components/dashboard/dashboard-board.tsx`
  - Owns board layout, columns, open/completed card rendering, size-pill derivation, and presentational search/filter controls.
- Modify `apps/web/src/app/page.tsx`
  - Keeps auth/data fetch behavior, classifies PRs into board columns, and delegates rendering to dashboard components.
- Modify `apps/web/src/app/page.test.ts`
  - Owns source-level dashboard contract checks for the redesigned page and components.

## DAG Overview

- wave-1: `backend-dashboard-contract`, `frontend-dashboard-board` in parallel because they edit disjoint packages.
- wave-2: `backend-spec-review`, `frontend-spec-review` after their implementation tasks.
- wave-3: `whole-change-quality-review` after both spec reviews.
- wave-4: `final-verification` after quality review.

---

### Task 1: Backend Dashboard Contract

```yaml
dag:
  id: "backend-dashboard-contract"
  purpose: "Extend the dashboard API payload with line counts and recently completed GitHub PRs."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/backend/src/application/dashboard/dashboard.facade.ts"
      - "apps/backend/src/application/dashboard/dashboard.facade.test.ts"
    modules:
      - "@folio/backend"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- dashboard.facade"
      - "pnpm --filter @folio/backend typecheck"
    expected: "Both commands exit 0."
  risk:
    collision: "low"
    external_write: false
    database: false
    deployment: false
    notes: "Only read-only GitHub API calls are added; no database writes or migrations."
  handoff_payload:
    include_spec_sections:
      - "Data Contract"
      - "Backend Behavior"
      - "Testing"
    include_plan_sections:
      - "Task 1: Backend Dashboard Contract"
```

**Files:**
- Modify: `apps/backend/src/application/dashboard/dashboard.facade.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard.facade.test.ts`

**Interfaces:**
- Produces:
  - `DashboardPull.additions: number`
  - `DashboardPull.deletions: number`
  - `DashboardCompletedState = "merged" | "closed"`
  - `DashboardCompletedPull`
  - `DashboardPayload.completedPulls: DashboardCompletedPull[]`
  - `DashboardPayload.metrics.completed: number`

- [ ] **Step 1: Replace backend dashboard facade tests with failing contract coverage**

Update `apps/backend/src/application/dashboard/dashboard.facade.test.ts` so the top-level mock helpers support `pulls.list` pagination and `pulls.get` detail enrichment. The test file should include these cases:

```ts
it("lists live open PRs with DB review status merged in", async () => {
  const octokit = octokitWith({
    open: [
      openPr({ number: 1, title: "Ready PR" }),
      openPr({ number: 2, title: "Processing PR", head: "wip" }),
    ],
    closed: [],
    details: {
      1: { additions: 10, deletions: 2, changed_files: 3 },
      2: { additions: 4, deletions: 1, changed_files: 1 },
    },
  });
  const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

  const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

  expect(payload.metrics).toEqual({
    ready: 1,
    processing: 1,
    installedRepos: 1,
    activeRepos: 1,
    completed: 0,
  });
  expect(payload.completedPulls).toEqual([]);
  expect(payload.pulls.find((p) => p.number === 1)).toMatchObject({
    status: "ready",
    additions: 10,
    deletions: 2,
    changedFiles: 2,
  });
  expect(payload.pulls.find((p) => p.number === 2)).toMatchObject({
    status: "processing",
    additions: 4,
    deletions: 1,
    changedFiles: 0,
  });
});

it("maps closed GitHub pulls into recently completed pulls", async () => {
  const octokit = octokitWith({
    open: [],
    closed: [
      closedPr({ number: 69, title: "Merged PR", mergedAt: "2026-07-08T10:00:00Z" }),
      closedPr({ number: 67, title: "Closed PR", closedAt: "2026-07-08T09:00:00Z" }),
    ],
    details: {
      69: { additions: 81, deletions: 32, changed_files: 4 },
      67: { additions: 3492, deletions: 16, changed_files: 18 },
    },
  });
  const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

  const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

  expect(payload.metrics.completed).toBe(2);
  expect(payload.completedPulls).toEqual([
    expect.objectContaining({
      number: 69,
      title: "Merged PR",
      completedState: "merged",
      additions: 81,
      deletions: 32,
      changedFiles: 4,
    }),
    expect.objectContaining({
      number: 67,
      title: "Closed PR",
      completedState: "closed",
      additions: 3492,
      deletions: 16,
      changedFiles: 18,
    }),
  ]);
});

it("sorts completed pulls newest first and caps them at 20", async () => {
  const closed = Array.from({ length: 25 }, (_, index) =>
    closedPr({
      number: index + 1,
      title: `Completed ${index + 1}`,
      mergedAt: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
    }),
  );
  const octokit = octokitWith({ open: [], closed, details: {} });
  const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

  const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

  expect(payload.completedPulls).toHaveLength(20);
  expect(payload.completedPulls[0]?.number).toBe(25);
  expect(payload.completedPulls.at(-1)?.number).toBe(6);
  expect(payload.metrics.completed).toBe(20);
});

it("falls back to zero detail counts when completed pull enrichment fails", async () => {
  const octokit = octokitWith({
    open: [],
    closed: [closedPr({ number: 7, mergedAt: "2026-07-08T10:00:00Z" })],
    details: {},
    failDetailsFor: new Set([7]),
  });
  const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

  const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

  expect(payload.completedPulls[0]).toMatchObject({
    number: 7,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
  });
});
```

Keep the existing disabled-repository tests, updating their expected metrics to include `completed: 0`.

- [ ] **Step 2: Run backend dashboard test and verify it fails**

Run:

```bash
pnpm --filter @folio/backend test -- dashboard.facade
```

Expected: FAIL because `completedPulls`, `metrics.completed`, and line count fields are not implemented yet.

- [ ] **Step 3: Extend backend types and helpers**

In `apps/backend/src/application/dashboard/dashboard.facade.ts`, add:

```ts
export type DashboardCompletedState = "merged" | "closed";

export interface DashboardCompletedPull {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  completedAt: string;
  completedState: DashboardCompletedState;
  additions: number;
  deletions: number;
  changedFiles: number;
}

interface PullLineCounts {
  additions: number;
  deletions: number;
  changedFiles: number;
}

interface CompletedCandidate {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  completedIso: string;
  completedState: DashboardCompletedState;
}

const EMPTY_LINE_COUNTS: PullLineCounts = {
  additions: 0,
  deletions: 0,
  changedFiles: 0,
};
const COMPLETED_PULL_LIMIT = 20;
```

Update `DashboardPull` with `additions` and `deletions`, update `DashboardPayload.metrics` with `completed`, and add `completedPulls`.

- [ ] **Step 4: Implement read-only detail enrichment and completed candidate mapping**

Add private methods to `DashboardFacade`:

```ts
private async pullLineCounts(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullLineCounts> {
  try {
    const { data } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return {
      additions: data.additions ?? 0,
      deletions: data.deletions ?? 0,
      changedFiles: data.changed_files ?? 0,
    };
  } catch {
    return EMPTY_LINE_COUNTS;
  }
}

private completedCandidate(owner: string, repo: string, pr: Awaited<ReturnType<Octokit["paginate"]>>[number]): CompletedCandidate | null {
  const completedIso = pr.merged_at ?? pr.closed_at;
  if (!completedIso) {
    return null;
  }
  return {
    owner,
    repo,
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "unknown",
    completedIso,
    completedState: pr.merged_at ? "merged" : "closed",
  };
}
```

If TypeScript rejects the `Octokit["paginate"]` item type, replace the parameter with a local structural type that includes only `number`, `title`, `user`, `merged_at`, and `closed_at`.

- [ ] **Step 5: Fetch open and closed PRs independently**

Inside the enabled repo loop, keep the existing open PR fetch behavior, then add a separate closed PR fetch. Use isolated `try/catch` blocks:

```ts
let openPrs: Awaited<ReturnType<Octokit["paginate"]>> = [];
try {
  openPrs = await octokit.paginate(octokit.rest.pulls.list, {
    owner: repo.owner,
    repo: repo.name,
    state: "open",
    per_page: 100,
  });
} catch {
  repos.push({
    id: repo.id,
    fullName: repo.fullName,
    openPrCount: 0,
    folioEnabled: true,
  });
  continue;
}

let closedPrs: Awaited<ReturnType<Octokit["paginate"]>> = [];
try {
  closedPrs = await octokit.paginate(octokit.rest.pulls.list, {
    owner: repo.owner,
    repo: repo.name,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 20,
  });
} catch {
  closedPrs = [];
}
```

Push closed PR candidates into a `completedCandidates: CompletedCandidate[]` array declared before the installation loop.

- [ ] **Step 6: Add line counts to open pulls**

When constructing each open `DashboardPull`, enrich with:

```ts
const lineCounts = await this.pullLineCounts(octokit, repo.owner, repo.name, pr.number);
const status = await this.resolveStatus(user.id, repo.id, pr.number);
pulls.push({
  id: `${repo.owner}-${repo.name}-${pr.number}`,
  org: repo.owner,
  repo: repo.name,
  number: pr.number,
  title: pr.title,
  author: pr.user?.login ?? "unknown",
  updatedAt: relativeTime(pr.updated_at),
  headBranch: pr.head.ref,
  baseBranch: pr.base.ref,
  risk: "low",
  additions: lineCounts.additions,
  deletions: lineCounts.deletions,
  ...status,
});
```

Keep `changedFiles` from `resolveStatus` for ready PRs because it reflects Folio chapter coverage. Processing PRs keep `changedFiles: 0` from `PROCESSING`.

- [ ] **Step 7: Build sorted capped completed pulls**

After all installation loops complete and before returning:

```ts
const completedPulls: DashboardCompletedPull[] = [];
for (const candidate of completedCandidates
  .sort((a, b) => new Date(b.completedIso).getTime() - new Date(a.completedIso).getTime())
  .slice(0, COMPLETED_PULL_LIMIT)) {
  const octokit = octokitByRepoKey.get(`${candidate.owner}/${candidate.repo}`);
  const lineCounts = octokit
    ? await this.pullLineCounts(octokit, candidate.owner, candidate.repo, candidate.number)
    : EMPTY_LINE_COUNTS;

  completedPulls.push({
    id: `${candidate.owner}-${candidate.repo}-${candidate.number}`,
    org: candidate.owner,
    repo: candidate.repo,
    number: candidate.number,
    title: candidate.title,
    author: candidate.author,
    completedAt: relativeTime(candidate.completedIso),
    completedState: candidate.completedState,
    additions: lineCounts.additions,
    deletions: lineCounts.deletions,
    changedFiles: lineCounts.changedFiles,
  });
}
```

Create `octokitByRepoKey = new Map<string, Octokit>()` when an enabled repo has a usable Octokit, so completed enrichment can reuse the same installation client.

- [ ] **Step 8: Return the expanded metrics and payload**

Return:

```ts
return {
  metrics: {
    ready,
    processing: pulls.length - ready,
    installedRepos: repos.length,
    activeRepos: repos.filter((repo) => repo.folioEnabled).length,
    completed: completedPulls.length,
  },
  repos,
  pulls,
  completedPulls,
  activity,
};
```

- [ ] **Step 9: Run backend verification**

Run:

```bash
pnpm --filter @folio/backend test -- dashboard.facade
pnpm --filter @folio/backend typecheck
```

Expected: both commands PASS.

- [ ] **Step 10: Commit backend changes**

Run:

```bash
git add apps/backend/src/application/dashboard/dashboard.facade.ts apps/backend/src/application/dashboard/dashboard.facade.test.ts
git commit -m "feat(dashboard): include recently completed pulls"
```

Expected: commit succeeds without bypassing hooks.

---

### Task 2: Frontend Dashboard Board

```yaml
dag:
  id: "frontend-dashboard-board"
  purpose: "Replace the dashboard page with a server-rendered PR board using the expanded payload contract."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "apps/web/src/lib/dashboard-api.ts"
      - "apps/web/src/components/dashboard/dashboard-board.tsx"
      - "apps/web/src/app/page.tsx"
      - "apps/web/src/app/page.test.ts"
    modules:
      - "@folio/web"
  verification:
    commands:
      - "pnpm --filter @folio/web test -- page"
      - "pnpm --filter @folio/web typecheck"
    expected: "Both commands exit 0."
  risk:
    collision: "low"
    external_write: false
    database: false
    deployment: false
    notes: "Frontend task depends on the agreed payload shape but edits no backend files."
  handoff_payload:
    include_spec_sections:
      - "Frontend Behavior"
      - "Components"
      - "Layout And Styling"
      - "Testing"
    include_plan_sections:
      - "Task 2: Frontend Dashboard Board"
```

**Files:**
- Modify: `apps/web/src/lib/dashboard-api.ts`
- Create: `apps/web/src/components/dashboard/dashboard-board.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.test.ts`

**Interfaces:**
- Consumes:
  - `DashboardPayload.completedPulls: DashboardCompletedPull[]`
  - `DashboardPull.additions: number`
  - `DashboardPull.deletions: number`
- Produces:
  - `DashboardBoard`
  - `DashboardColumn`
  - `OpenPullCard`
  - `CompletedPullCard`
  - `DashboardSearchBar`

- [ ] **Step 1: Update frontend source-level test first**

Replace `apps/web/src/app/page.test.ts` expectations with contract checks for the new dashboard:

```ts
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DashboardPage", () => {
  it("renders the PR board dashboard instead of repository access controls", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).toContain("DashboardBoard");
    expect(source).toContain("completedPulls");
    expect(source).toContain("Ready to review");
    expect(source).toContain("Your pull requests");
    expect(source).toContain("Other");
    expect(source).toContain("Recently completed");
    expect(source).not.toContain("RepositoryToggleForm");
    expect(source).not.toContain("activeRepos");
    expect(source).not.toContain("folioEnabled");
  });

  it("keeps dashboard board components in a focused module", async () => {
    const source = await readFile(
      new URL("../components/dashboard/dashboard-board.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("export function DashboardBoard");
    expect(source).toContain("function DashboardColumn");
    expect(source).toContain("function OpenPullCard");
    expect(source).toContain("function CompletedPullCard");
    expect(source).toContain("function DashboardSearchBar");
    expect(source).toContain("size/XS");
  });
});
```

- [ ] **Step 2: Run web page test and verify it fails**

Run:

```bash
pnpm --filter @folio/web test -- page
```

Expected: FAIL because `DashboardBoard` and `completedPulls` are not implemented yet.

- [ ] **Step 3: Extend web dashboard API types**

In `apps/web/src/lib/dashboard-api.ts`, add `additions` and `deletions` to `DashboardPull`, define:

```ts
export type DashboardCompletedState = "merged" | "closed";

export interface DashboardCompletedPull {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  completedAt: string;
  completedState: DashboardCompletedState;
  additions: number;
  deletions: number;
  changedFiles: number;
}
```

Update `DashboardPayload.metrics` with `completed: number` and add `completedPulls: DashboardCompletedPull[]`.

- [ ] **Step 4: Create dashboard board component module**

Create `apps/web/src/components/dashboard/dashboard-board.tsx` with:

```tsx
import {
  Check,
  GitMerge,
  GitPullRequest,
  ListFilter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";

import type { DashboardCompletedPull, DashboardPull } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export interface DashboardBoardProps {
  readyPulls: DashboardPull[];
  yourPulls: DashboardPull[];
  otherPulls: DashboardPull[];
  completedPulls: DashboardCompletedPull[];
}

interface ColumnProps {
  title: string;
  count: number;
  children: React.ReactNode;
  emptyText: string;
  dashed?: boolean;
}

type SizeTone = "green" | "amber" | "red";

interface SizeMeta {
  label: string;
  tone: SizeTone;
}

export function DashboardBoard({
  readyPulls,
  yourPulls,
  otherPulls,
  completedPulls,
}: DashboardBoardProps) {
  return (
    <div className="space-y-6">
      <DashboardSearchBar />
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        <DashboardColumn
          title="Ready to review"
          count={readyPulls.length}
          emptyText="리뷰 준비가 끝난 PR이 없습니다."
        >
          {readyPulls.map((pull) => (
            <OpenPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>

        <DashboardColumn
          title="Your pull requests"
          count={yourPulls.length}
          emptyText="내가 작성한 열린 PR이 없습니다."
        >
          {yourPulls.map((pull) => (
            <OpenPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>

        <DashboardColumn title="Other" count={otherPulls.length} emptyText="그 외 열린 PR이 없습니다.">
          {otherPulls.map((pull) => (
            <OpenPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>

        <DashboardColumn
          title="Recently completed"
          count={completedPulls.length}
          emptyText="최근 완료된 PR이 없습니다."
          dashed
        >
          {completedPulls.map((pull) => (
            <CompletedPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add column, search, card, and size helper functions**

In the same file, add:

```tsx
function DashboardColumn({ title, count, children, emptyText, dashed = false }: ColumnProps) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="grid gap-3">
        {count > 0 ? (
          children
        ) : (
          <div
            className={cn(
              "rounded-lg border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground",
              dashed && "border-dashed",
            )}
          >
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function DashboardSearchBar() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-muted-foreground">
        <Search className="size-4 shrink-0" />
        <span className="truncate text-sm">Search pull requests...</span>
      </div>
      <button
        type="button"
        aria-label="Filter pull requests"
        disabled
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70"
      >
        <ListFilter className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Sort pull requests"
        disabled
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70"
      >
        <SlidersHorizontal className="size-4" />
      </button>
    </div>
  );
}

function OpenPullCard({ pull }: { pull: DashboardPull }) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const ready = pull.status === "ready";
  const StatusIcon = ready ? Check : X;

  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}/chapters/1`}
      className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/35"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitPullRequest className="size-3.5 text-warning" />
            <span className="truncate">
              {pull.repo}#{pull.number}
            </span>
            <StatusIcon
              className={cn("size-3.5", ready ? "text-primary" : "text-destructive")}
            />
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">
            {pull.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{pull.updatedAt}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SizePill meta={size} />
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs">
        <span className="truncate text-warning">{pull.author}</span>
        <span className="text-primary">+{pull.additions}</span>
        <span className="text-destructive">-{pull.deletions}</span>
      </div>
    </Link>
  );
}

function CompletedPullCard({ pull }: { pull: DashboardCompletedPull }) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const StateIcon = pull.completedState === "merged" ? GitMerge : X;

  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}`}
      className="group rounded-lg border border-dashed bg-background/35 p-4 transition-colors hover:border-primary/35"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StateIcon
              className={cn(
                "size-3.5",
                pull.completedState === "merged" ? "text-syntax-emphasis" : "text-destructive",
              )}
            />
            <span className="truncate">
              {pull.repo}#{pull.number}
            </span>
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">
            {pull.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{pull.completedAt}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SizePill meta={size} />
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs">
        <span className="truncate text-warning">{pull.author}</span>
        <span className="text-primary">+{pull.additions}</span>
        <span className="text-destructive">-{pull.deletions}</span>
      </div>
    </Link>
  );
}

function SizePill({ meta }: { meta: SizeMeta }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.tone === "green" && "border-primary/30 bg-primary/10 text-primary",
        meta.tone === "amber" && "border-warning/40 bg-warning/10 text-warning",
        meta.tone === "red" && "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {meta.label}
    </span>
  );
}

function sizeMeta(changedFiles: number, churn: number): SizeMeta {
  if (changedFiles <= 2 && churn <= 30) {
    return { label: "size/XS", tone: "green" };
  }
  if (changedFiles <= 5 && churn <= 150) {
    return { label: "size/S", tone: "green" };
  }
  if (changedFiles <= 12 && churn <= 600) {
    return { label: "size/M", tone: "amber" };
  }
  if (changedFiles <= 25 && churn <= 1500) {
    return { label: "size/L", tone: "amber" };
  }
  return { label: "size/XXL", tone: "red" };
}
```

If the project's Tailwind setup does not support `line-clamp-2`, replace those classes with `truncate` before committing.

- [ ] **Step 6: Simplify dashboard page and classify open PRs**

Replace metric/repository markup in `apps/web/src/app/page.tsx` with:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { DashboardBoard } from "@/components/dashboard/dashboard-board";
import { ApiError } from "@/lib/api-client";
import { getMe } from "@/lib/auth";
import { type DashboardPayload, fetchDashboard } from "@/lib/dashboard-api";

// Live dashboard: open and recently completed PRs from installed repos.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let data: DashboardPayload;
  try {
    data = await fetchDashboard({ cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login?redirect=/");
    }
    throw err;
  }

  const user = await getMe(cookieHeader);
  const userLogin = user?.login;
  const yourPulls = userLogin ? data.pulls.filter((pull) => pull.author === userLogin) : [];
  const readyPulls = data.pulls.filter(
    (pull) => pull.author !== userLogin && pull.status === "ready",
  );
  const otherPulls = data.pulls.filter(
    (pull) => pull.author !== userLogin && pull.status !== "ready",
  );

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-7 p-4 md:p-6">
          <header className="pt-6">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Welcome back, {user?.login ?? "reviewer"}
            </h1>
          </header>

          <DashboardBoard
            readyPulls={readyPulls}
            yourPulls={yourPulls}
            otherPulls={otherPulls}
            completedPulls={data.completedPulls}
          />
        </div>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 7: Run web verification**

Run:

```bash
pnpm --filter @folio/web test -- page
pnpm --filter @folio/web typecheck
```

Expected: both commands PASS.

- [ ] **Step 8: Commit frontend changes**

Run:

```bash
git add apps/web/src/lib/dashboard-api.ts apps/web/src/components/dashboard/dashboard-board.tsx apps/web/src/app/page.tsx apps/web/src/app/page.test.ts
git commit -m "feat(web): redesign dashboard as pull request board"
```

Expected: commit succeeds without bypassing hooks.

---

### Task 3: Backend Spec Review

```yaml
dag:
  id: "backend-spec-review"
  purpose: "Review backend implementation against the approved dashboard data and behavior spec."
  deps: ["backend-dashboard-contract"]
  parallel_group: "wave-2"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files:
      - "docs/superpowers/specs/2026-07-09-dashboard-board-redesign-design.md"
      - "apps/backend/src/application/dashboard/dashboard.facade.ts"
      - "apps/backend/src/application/dashboard/dashboard.facade.test.ts"
    modules:
      - "@folio/backend"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- dashboard.facade"
    expected: "Command exits 0 and reviewer reports PASS or actionable findings."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review."
  handoff_payload:
    include_spec_sections:
      - "Data Contract"
      - "Backend Behavior"
      - "Testing"
    include_plan_sections:
      - "Task 1: Backend Dashboard Contract"
      - "Task 3: Backend Spec Review"
```

**Files:**
- Review: `apps/backend/src/application/dashboard/dashboard.facade.ts`
- Review: `apps/backend/src/application/dashboard/dashboard.facade.test.ts`

**Interfaces:**
- Consumes: backend implementation from Task 1.
- Produces: review result `PASS` or a list of required fixes.

- [ ] **Step 1: Inspect backend diff**

Run:

```bash
git show --stat --oneline HEAD
git show -- apps/backend/src/application/dashboard/dashboard.facade.ts apps/backend/src/application/dashboard/dashboard.facade.test.ts
```

Expected: output shows only backend dashboard facade and backend dashboard tests for the Task 1 commit.

- [ ] **Step 2: Verify spec requirements**

Check that:

- `DashboardPayload` includes `completedPulls`.
- `metrics` includes `completed`.
- open pulls include `additions` and `deletions`.
- completed pulls map `merged_at` to `merged` and closed-only PRs to `closed`.
- completed pulls are sorted by completion time and capped at 20.
- GitHub failures are isolated and do not fail the whole dashboard.

- [ ] **Step 3: Run backend test**

Run:

```bash
pnpm --filter @folio/backend test -- dashboard.facade
```

Expected: PASS.

- [ ] **Step 4: Report review result**

Return one of:

```txt
worker_done backend-spec-review PASS
```

or:

```txt
worker_done backend-spec-review FAIL
Findings:
- <file>:<line> <issue and required fix>
```

---

### Task 4: Frontend Spec Review

```yaml
dag:
  id: "frontend-spec-review"
  purpose: "Review frontend implementation against the approved dashboard layout and component spec."
  deps: ["frontend-dashboard-board"]
  parallel_group: "wave-2"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files:
      - "docs/superpowers/specs/2026-07-09-dashboard-board-redesign-design.md"
      - "apps/web/src/lib/dashboard-api.ts"
      - "apps/web/src/components/dashboard/dashboard-board.tsx"
      - "apps/web/src/app/page.tsx"
      - "apps/web/src/app/page.test.ts"
    modules:
      - "@folio/web"
  verification:
    commands:
      - "pnpm --filter @folio/web test -- page"
    expected: "Command exits 0 and reviewer reports PASS or actionable findings."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review."
  handoff_payload:
    include_spec_sections:
      - "Frontend Behavior"
      - "Components"
      - "Layout And Styling"
      - "Testing"
    include_plan_sections:
      - "Task 2: Frontend Dashboard Board"
      - "Task 4: Frontend Spec Review"
```

**Files:**
- Review: `apps/web/src/lib/dashboard-api.ts`
- Review: `apps/web/src/components/dashboard/dashboard-board.tsx`
- Review: `apps/web/src/app/page.tsx`
- Review: `apps/web/src/app/page.test.ts`

**Interfaces:**
- Consumes: frontend implementation from Task 2.
- Produces: review result `PASS` or a list of required fixes.

- [ ] **Step 1: Inspect frontend diff**

Run:

```bash
git show --stat --oneline HEAD
git show -- apps/web/src/lib/dashboard-api.ts apps/web/src/components/dashboard/dashboard-board.tsx apps/web/src/app/page.tsx apps/web/src/app/page.test.ts
```

Expected: output shows frontend dashboard API types, dashboard board component, page, and page test changes.

- [ ] **Step 2: Verify spec requirements**

Check that:

- `page.tsx` classifies `Your pull requests`, `Ready to review`, and `Other` exactly from user login, author, and status.
- `DashboardBoard` receives `completedPulls`.
- `DashboardSearchBar` is presentational and not pretending to filter.
- components use design-system tokens and no raw colors.
- responsive layout is one/two/four columns.
- repository access controls are removed from the dashboard page.

- [ ] **Step 3: Run frontend test**

Run:

```bash
pnpm --filter @folio/web test -- page
```

Expected: PASS.

- [ ] **Step 4: Report review result**

Return one of:

```txt
worker_done frontend-spec-review PASS
```

or:

```txt
worker_done frontend-spec-review FAIL
Findings:
- <file>:<line> <issue and required fix>
```

---

### Task 5: Whole-Change Quality Review

```yaml
dag:
  id: "whole-change-quality-review"
  purpose: "Review the combined backend and frontend changes for code quality, integration risks, and missing tests."
  deps: ["backend-spec-review", "frontend-spec-review"]
  parallel_group: "wave-3"
  worktree_strategy: "intra-worktree"
  worker_role: "quality-reviewer"
  scope:
    files:
      - "apps/backend/src/application/dashboard/dashboard.facade.ts"
      - "apps/backend/src/application/dashboard/dashboard.facade.test.ts"
      - "apps/web/src/lib/dashboard-api.ts"
      - "apps/web/src/components/dashboard/dashboard-board.tsx"
      - "apps/web/src/app/page.tsx"
      - "apps/web/src/app/page.test.ts"
    modules:
      - "@folio/backend"
      - "@folio/web"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- dashboard.facade"
      - "pnpm --filter @folio/web test -- page"
    expected: "Both commands exit 0 and reviewer reports PASS or actionable findings."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review across both packages."
  handoff_payload:
    include_spec_sections:
      - "Risks"
      - "Testing"
    include_plan_sections:
      - "Task 5: Whole-Change Quality Review"
```

**Files:**
- Review all implementation files listed in this task's DAG scope.

**Interfaces:**
- Consumes: passing implementation plus spec reviews.
- Produces: quality review result `PASS` or a list of required fixes.

- [ ] **Step 1: Inspect combined diff**

Run:

```bash
git diff f96e936...HEAD -- apps/backend/src/application/dashboard apps/web/src/lib/dashboard-api.ts apps/web/src/components/dashboard apps/web/src/app/page.tsx apps/web/src/app/page.test.ts
```

Expected: output contains only dashboard backend and frontend changes.

- [ ] **Step 2: Review integration risks**

Check that:

- backend and frontend type names match exactly;
- no task introduced raw colors or new dependencies;
- GitHub API failures degrade gracefully;
- all new data fields have tests or source-level contract checks;
- no unrelated files were changed;
- no generated secrets or environment files were staged.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --filter @folio/backend test -- dashboard.facade
pnpm --filter @folio/web test -- page
```

Expected: both PASS.

- [ ] **Step 4: Report review result**

Return one of:

```txt
worker_done whole-change-quality-review PASS
```

or:

```txt
worker_done whole-change-quality-review FAIL
Findings:
- <file>:<line> <issue and required fix>
```

---

### Task 6: Final Verification

```yaml
dag:
  id: "final-verification"
  purpose: "Run final focused and broad verification before reporting completion."
  deps: ["whole-change-quality-review"]
  parallel_group: "wave-4"
  worktree_strategy: "coordinator-only"
  worker_role: "verifier"
  scope:
    files:
      - "apps/backend/src/application/dashboard/dashboard.facade.ts"
      - "apps/backend/src/application/dashboard/dashboard.facade.test.ts"
      - "apps/web/src/lib/dashboard-api.ts"
      - "apps/web/src/components/dashboard/dashboard-board.tsx"
      - "apps/web/src/app/page.tsx"
      - "apps/web/src/app/page.test.ts"
    modules:
      - "@folio/backend"
      - "@folio/web"
  verification:
    commands:
      - "pnpm --filter @folio/backend test -- dashboard.facade"
      - "pnpm --filter @folio/web test -- page"
      - "pnpm lint"
      - "pnpm typecheck"
    expected: "All commands exit 0, or ambiguous failures trigger a decision gate."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Verification only."
  handoff_payload:
    include_spec_sections:
      - "Testing"
    include_plan_sections:
      - "Task 6: Final Verification"
```

**Files:**
- Verify implementation files listed in this task's DAG scope.

**Interfaces:**
- Consumes: reviewed combined implementation.
- Produces: final verification result and completion report.

- [ ] **Step 1: Check working tree**

Run:

```bash
git status --short --untracked-files=all
```

Expected: only intentional dashboard changes are present. Existing unrelated untracked files may remain untouched and must be called out in the final report.

- [ ] **Step 2: Run focused backend test**

Run:

```bash
pnpm --filter @folio/backend test -- dashboard.facade
```

Expected: PASS.

- [ ] **Step 3: Run focused frontend test**

Run:

```bash
pnpm --filter @folio/web test -- page
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Report final result**

Return:

```txt
worker_done final-verification PASS
Verified:
- pnpm --filter @folio/backend test -- dashboard.facade
- pnpm --filter @folio/web test -- page
- pnpm lint
- pnpm typecheck
```

If any command fails for an ambiguous reason, stop and open a decision gate rather than guessing.

---

## Dispatch Gate

Spec: `docs/superpowers/specs/2026-07-09-dashboard-board-redesign-design.md`
Plan: `docs/superpowers/plans/2026-07-09-dashboard-board-redesign.md`

Waves:
- wave-1: `backend-dashboard-contract` using `inter-worktree`; `frontend-dashboard-board` using `inter-worktree`
- wave-2: `backend-spec-review` using `intra-worktree`; `frontend-spec-review` using `intra-worktree`
- wave-3: `whole-change-quality-review` using `intra-worktree`
- wave-4: `final-verification` using `coordinator-only`

Dependencies:
- `backend-spec-review` depends on `backend-dashboard-contract`.
- `frontend-spec-review` depends on `frontend-dashboard-board`.
- `whole-change-quality-review` depends on both spec reviews.
- `final-verification` depends on quality review.

Worktree strategy:
- Implementation tasks use separate inter-worktree workers because backend and frontend file scopes do not overlap.
- Review tasks use the coordinator checkout to inspect integrated results.
- Final verification is coordinator-only.

Worker roles:
- `backend-dashboard-contract`: implementer
- `frontend-dashboard-board`: implementer
- `backend-spec-review`: spec-reviewer
- `frontend-spec-review`: spec-reviewer
- `whole-change-quality-review`: quality-reviewer
- `final-verification`: verifier

Verification:
- `pnpm --filter @folio/backend test -- dashboard.facade` expects PASS.
- `pnpm --filter @folio/web test -- page` expects PASS.
- `pnpm --filter @folio/backend typecheck` expects PASS.
- `pnpm --filter @folio/web typecheck` expects PASS.
- `pnpm lint` expects PASS.
- `pnpm typecheck` expects PASS.

Known risks and mitigations:
- GitHub API call volume increases. Mitigation: completed PRs are capped at 20 before detail enrichment.
- Frontend and backend contracts are duplicated. Mitigation: both implementation tasks use the exact same field names from this plan, and whole-change quality review checks them together.
- Presentational search/filter controls may look active. Mitigation: controls are disabled and have no hidden client filtering logic.

Decision gates:
- Stop if GitHub API response typing makes `pulls.list` and `pulls.get` impossible to model without broad `any`.
- Stop if focused tests pass individually but full `pnpm typecheck` fails in unrelated packages.
- Stop if any worker reports overlapping edits with another active task.
- Stop if implementation needs database migrations, credentials, production data, deployment, or external writes.

Approve worker dispatch?
