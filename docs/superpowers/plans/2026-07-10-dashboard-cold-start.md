# Dashboard Cold-Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce uncached dashboard startup work by loading all open buckets through one scan and enriching visible pull details with bounded concurrency.

**Architecture:** Add a combined `/api/v1/dashboard/pulls/open` endpoint that reuses the existing installation/repository traversal, resolves each open PR status once, partitions candidates into three pages, and keeps old bucket cursors compatible for append loads. Replace serial pull-detail enrichment with one order-preserving batch loader capped at five concurrent GitHub requests, then switch the client reset path from four requests to combined-open plus completed.

**Tech Stack:** TypeScript ESM, NestJS, Next.js App Router, React 19, Octokit, Vitest, pnpm

## Global Constraints

- Preserve the existing `GET /api/v1/dashboard/pulls?bucket=...` contract and cursor format.
- Keep API responses inside Folio's common response envelope.
- Do not depend on a warm process-local cache for cold-start performance.
- Keep repository failures isolated and detail failures mapped to zero line counts.
- Preserve the dashboard's visible structure and existing design-system usage.
- Do not add a `max-lines` disable or bypass git hooks.

---

### Task 1: Bounded Pull-Detail Enrichment

**Files:**
- Create: `apps/backend/src/application/dashboard/dashboard-pull-details.test.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard-pull-details.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard-pull-page.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard-completed-pull-window.ts`

**Interfaces:**
- Consumes: `pullLineCounts(octokit, owner, repo, pullNumber, opts?)`.
- Produces: `pullLineCountsForPulls(requests: PullLineCountRequest[]): Promise<PullLineCounts[]>`.
- Produces: `DASHBOARD_PULL_DETAIL_CONCURRENCY = 5`.

- [ ] **Step 1: Write the failing concurrency test**

Create `dashboard-pull-details.test.ts` with this core test. It proves overlap, the ceiling, and input-order output:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PULL_DETAIL_CONCURRENCY,
  pullLineCountsForPulls,
} from "./dashboard-pull-details.js";

describe("dashboard pull detail batching", () => {
  it("loads details concurrently up to the limit and preserves order", async () => {
    const pending = new Map<number, ReturnType<typeof deferred<PullDetail>>>();
    let active = 0;
    let maxActive = 0;
    const get = vi.fn(({ pull_number }: { pull_number: number }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const call = deferred<PullDetail>();
      pending.set(pull_number, call);
      return call.promise.finally(() => {
        active -= 1;
      });
    });
    const octokit = { rest: { pulls: { get } } } as never;
    const resultPromise = pullLineCountsForPulls(
      Array.from({ length: 6 }, (_, index) => ({
        octokit,
        owner: "KMGeon",
        repo: "Folio",
        pullNumber: index + 1,
      })),
    );

    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(DASHBOARD_PULL_DETAIL_CONCURRENCY));
    expect(maxActive).toBe(DASHBOARD_PULL_DETAIL_CONCURRENCY);
    pending.get(1)?.resolve(detail(1));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(6));
    for (let number = 2; number <= 6; number += 1) pending.get(number)?.resolve(detail(number));

    await expect(resultPromise).resolves.toEqual(
      Array.from({ length: 6 }, (_, index) => ({
        additions: index + 1,
        deletions: 0,
        changedFiles: 1,
      })),
    );
  });
});

type PullDetail = { data: { additions: number; deletions: number; changed_files: number } };
const detail = (number: number): PullDetail => ({
  data: { additions: number, deletions: 0, changed_files: 1 },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `pnpm exec vitest run apps/backend/src/application/dashboard/dashboard-pull-details.test.ts`.

Expected: FAIL because both new exports are absent.

- [ ] **Step 3: Implement the order-preserving bounded loader**

Add these declarations to `dashboard-pull-details.ts`:

```ts
export const DASHBOARD_PULL_DETAIL_CONCURRENCY = 5;
export type PullLineCountRequest = {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullNumber: number;
  ttlMs?: number;
};

export async function pullLineCountsForPulls(
  requests: PullLineCountRequest[],
): Promise<PullLineCounts[]> {
  const results = new Array<PullLineCounts>(requests.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(DASHBOARD_PULL_DETAIL_CONCURRENCY, requests.length) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        const request = requests[index];
        if (!request) return;
        results[index] = await pullLineCounts(
          request.octokit,
          request.owner,
          request.repo,
          request.pullNumber,
          request.ttlMs ? { ttlMs: request.ttlMs } : undefined,
        );
      }
    },
  );
  await Promise.all(workers);
  return results;
}
```

Update `openPulls()` and `completedPulls()` to batch candidates once and map indexed counts instead
of awaiting `pullLineCounts()` in a loop.

- [ ] **Step 4: Verify GREEN and regressions**

Run `pnpm exec vitest run apps/backend/src/application/dashboard/dashboard-pull-details.test.ts apps/backend/src/application/dashboard/dashboard.facade.test.ts apps/backend/src/application/dashboard/dashboard-github-cache.test.ts`.

Expected: PASS, including the new concurrency ceiling and existing fallback behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/application/dashboard/dashboard-pull-details.ts apps/backend/src/application/dashboard/dashboard-pull-details.test.ts apps/backend/src/application/dashboard/dashboard-pull-page.ts apps/backend/src/application/dashboard/dashboard-completed-pull-window.ts
git commit -m "perf(dashboard): parallelize pull detail loading"
```

---

### Task 2: Combined Open Pull Pages Backend

**Files:**
- Modify: `apps/backend/src/application/dashboard/dashboard-pull-page-types.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard-repo-pull-candidates.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard-pull-page.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard.facade.ts`
- Modify: `apps/backend/src/application/dashboard/dashboard.facade.test.ts`
- Modify: `apps/backend/src/interfaces/api/dashboard/dashboard.controller.ts`
- Modify: `apps/backend/src/interfaces/api/dashboard/dashboard.controller.test.ts`

**Interfaces:**
- Produces: `DashboardOpenBucket`, `DashboardOpenPullPageQuery`, `DashboardOpenPullPages`.
- Produces: `DashboardFacade.getOpenPullPagesForUser(user, input)`.
- Produces: `GET /api/v1/dashboard/pulls/open`.
- Preserves: `getPullPageForUser()` and current bucket pagination.

- [ ] **Step 1: Write the failing facade test**

Add to `dashboard.facade.test.ts`:

```ts
it("builds all open buckets while resolving each pull status once", async () => {
  getByRepoAndNumber.mockImplementation(async (_repoId: string, number: number) =>
    number === 3 ? null : { id: `pr${number}` },
  );
  const octokit = octokitWith({
    open: [
      openPr({ number: 1, title: "Ready", user: "reviewer" }),
      openPr({ number: 2, title: "Mine", user: "KMGeon" }),
      openPr({ number: 3, title: "Other", user: "reviewer" }),
    ],
    closed: [],
    details: {},
  });
  const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

  const pages = await facade.getOpenPullPagesForUser(
    { id: "u1", login: "KMGeon" },
    { limit: 20, ordering: "updated", direction: "desc", showDrafts: true },
  );

  expect(pages.ready.items.map((pull) => pull.title)).toEqual(["Ready"]);
  expect(pages.yours.items.map((pull) => pull.title)).toEqual(["Mine"]);
  expect(pages.other.items.map((pull) => pull.title)).toEqual(["Other"]);
  expect(getByRepoAndNumber).toHaveBeenCalledTimes(3);
  expect(octokit.paginate).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the facade test and verify RED**

Run `pnpm exec vitest run apps/backend/src/application/dashboard/dashboard.facade.test.ts`.

Expected: FAIL because `getOpenPullPagesForUser` is absent.

- [ ] **Step 3: Add types and collect open candidates once**

Add to `dashboard-pull-page-types.ts`:

```ts
export type DashboardOpenBucket = Exclude<DashboardBucket, "completed">;
export type DashboardOpenPullPageQuery = Omit<
  DashboardPullPageQuery,
  "bucket" | "cursor" | "closedRange"
>;
export type DashboardOpenPullPages = Record<DashboardOpenBucket, DashboardPullPage>;
```

Change `openCandidatesForRepo()` to return all matching open candidates after one status resolution
per PR. Move `matchesOpenBucket()` filtering to the legacy single-bucket path. Add
`getDashboardOpenPullPagesForUser(user, input, deps)` in `dashboard-pull-page.ts` and share the
installation/repository traversal.

For updated ordering, sort/slice each partition first, combine selected candidates into one
`openPulls()` batch, then split enriched results by page lengths. For lines ordering, enrich the full
candidate set once and then partition/sort/page. This maintains a global detail concurrency ceiling
of five for the combined request. Expose the method and types through `DashboardFacade`.

- [ ] **Step 4: Verify the facade GREEN**

Run `pnpm exec vitest run apps/backend/src/application/dashboard/dashboard.facade.test.ts apps/backend/src/application/dashboard/dashboard-completed-range.test.ts`.

Expected: PASS, including legacy cursors and the one-status-resolution assertion.

- [ ] **Step 5: Write the failing controller test**

Request `/api/v1/dashboard/pulls/open?limit=20&ordering=updated&direction=desc&showDrafts=true` and
assert HTTP 200, `{ success: true, data }`, and:

```ts
expect(getOpenPullPagesForUser).toHaveBeenCalledWith(
  { id: "u1", login: "KMGeon" },
  { limit: 20, q: undefined, ordering: "updated", direction: "desc", showDrafts: true },
);
```

- [ ] **Step 6: Run the controller test and verify RED**

Run `pnpm exec vitest run apps/backend/src/interfaces/api/dashboard/dashboard.controller.test.ts`.

Expected: FAIL with 404 because the static route is absent.

- [ ] **Step 7: Add the static open route**

Add `@Get("pulls/open")` before the existing pull handler. Parse `limit`, `ordering`, `direction`,
and `showDrafts`, pass `q`, and call `getOpenPullPagesForUser`. Do not accept cursor or closed range.

- [ ] **Step 8: Verify backend GREEN**

Run `pnpm exec vitest run apps/backend/src/application/dashboard apps/backend/src/interfaces/api/dashboard/dashboard.controller.test.ts`.

Expected: all dashboard application and controller tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/application/dashboard/dashboard-pull-page-types.ts apps/backend/src/application/dashboard/dashboard-repo-pull-candidates.ts apps/backend/src/application/dashboard/dashboard-pull-page.ts apps/backend/src/application/dashboard/dashboard.facade.ts apps/backend/src/application/dashboard/dashboard.facade.test.ts apps/backend/src/interfaces/api/dashboard/dashboard.controller.ts apps/backend/src/interfaces/api/dashboard/dashboard.controller.test.ts
git commit -m "perf(dashboard): combine open pull buckets"
```

---

### Task 3: Combined Open Pull Pages Frontend

**Files:**
- Modify: `apps/web/src/lib/dashboard-api.ts`
- Modify: `apps/web/src/components/dashboard/dashboard-board-client.tsx`
- Modify: `apps/web/src/components/dashboard/dashboard-board-client.test.tsx`

**Interfaces:**
- Consumes: `DashboardOpenPullPages`.
- Produces: `dashboardOpenPullPagesPath(query)` and `fetchDashboardOpenPullPages(query)`.
- Preserves: `fetchDashboardPullPage(query)` for completed and append requests.

- [ ] **Step 1: Write failing frontend tests**

Add URL serialization coverage:

```ts
it("builds the combined open pull URL without completed-only fields", () => {
  const path = dashboardOpenPullPagesPath({
    limit: 20,
    q: "repo smoke",
    ordering: "updated",
    direction: "desc",
    grouping: "responsibility",
    showDrafts: false,
  });
  const url = new URL(path, "https://folio.test");
  expect(url.pathname).toBe("/api/v1/dashboard/pulls/open");
  expect(url.searchParams.get("limit")).toBe("20");
  expect(url.searchParams.get("q")).toBe("repo smoke");
  expect(url.searchParams.get("showDrafts")).toBe("false");
  expect(url.searchParams.has("bucket")).toBe(false);
  expect(url.searchParams.has("closedRange")).toBe(false);
});
```

Add source-level reset flow coverage following the existing test style:

```ts
expect(boardClient).toContain("void loadOpenBuckets(version)");
expect(boardClient).toContain('void loadBucket("completed", "reset", version)');
expect(boardClient).not.toContain("for (const { bucket } of bucketConfigs)");
```

- [ ] **Step 2: Run the frontend test and verify RED**

Run `pnpm exec vitest run apps/web/src/components/dashboard/dashboard-board-client.test.tsx`.

Expected: FAIL because the combined serializer and reset loader are absent.

- [ ] **Step 3: Add API types and serializer**

Add to `dashboard-api.ts`:

```ts
export type DashboardOpenBucket = Exclude<DashboardBucket, "completed">;
export type DashboardOpenPullPages = Record<DashboardOpenBucket, DashboardPullPage>;
export type DashboardOpenPullPagesQuery = Omit<
  DashboardPullPageQuery,
  "bucket" | "cursor" | "closedRange"
>;
export function fetchDashboardOpenPullPages(
  query: DashboardOpenPullPagesQuery,
): Promise<DashboardOpenPullPages> {
  return apiRequest<DashboardOpenPullPages>(dashboardOpenPullPagesPath(query));
}
```

Implement `dashboardOpenPullPagesPath()` with the existing query serialization rules except bucket,
cursor, and closed range.

- [ ] **Step 4: Switch reset loading to two independent requests**

Add `loadOpenBuckets(version)` to set all three open columns loading, call the combined endpoint, and
atomically apply the three pages. On failure, apply the existing error to all open columns. Extend
the in-flight target type with `"open"`. Change the reset effect to:

```ts
void loadOpenBuckets(version);
void loadBucket("completed", "reset", version);
```

Keep `loadBucket()` for completed reset, every append, and endpoint compatibility. Route open-column
retry callbacks through `loadOpenBuckets()`.

- [ ] **Step 5: Verify frontend GREEN**

Run `pnpm exec vitest run apps/web/src/components/dashboard/dashboard-board-client.test.tsx apps/web/src/app/dashboard/page.test.ts`.

Expected: PASS with the new URL and two-request reset assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/dashboard-api.ts apps/web/src/components/dashboard/dashboard-board-client.tsx apps/web/src/components/dashboard/dashboard-board-client.test.tsx
git commit -m "perf(dashboard): load open columns together"
```

---

### Task 4: Full Verification

**Files:**
- Verify only; modify an implementation file only when a command exposes a regression.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fresh evidence that the monorepo remains shippable.

- [ ] **Step 1: Run targeted dashboard tests**

Run `pnpm exec vitest run apps/backend/src/application/dashboard apps/backend/src/interfaces/api/dashboard/dashboard.controller.test.ts apps/web/src/components/dashboard/dashboard-board-client.test.tsx apps/web/src/app/dashboard/page.test.ts`.

Expected: all targeted tests PASS.

- [ ] **Step 2: Run repository verification**

Run, in order:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all four commands exit 0 without new suppressions.

- [ ] **Step 3: Inspect final state**

Run:

```bash
git diff --check
git status --short
git log --oneline -5
```

Expected: no whitespace errors, no unintended files, and the planned atomic commits. If verification
requires a correction, stage only affected files and commit `fix(dashboard): address cold-start verification`.
