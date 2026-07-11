# Global PR Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global search modal show recent open pull requests initially and search open pull requests instead of presenting static page navigation.

**Architecture:** `AppSearch` will reuse the existing `fetchDashboardOpenPullPages` API, merge its three open-PR buckets into one deduplicated result list, and rank the API's relative update labels for a compact recent list. The component will own debounced request state and reject stale responses while preserving its existing modal and keyboard behavior.

**Tech Stack:** TypeScript ESM, React 19, Next.js App Router, Vitest, Happy DOM, pnpm

## Global Constraints

- Search only open pull requests; do not include merged or closed pull requests.
- Show at most 10 results ordered from most recently updated to least recently updated.
- Match repository name, PR number, title, and author through the existing case-insensitive dashboard API query.
- Preserve the current dark-mode design tokens and modal focus behavior.
- Do not add dependencies, raw color values, vague module names, or a `max-lines` lint disable.
- All API calls must continue through `apps/web/src/lib/dashboard-api.ts`.

---

### Task 1: Replace page commands with recent open PR results

**Files:**
- Modify: `apps/web/src/components/app-search.test.tsx`
- Modify: `apps/web/src/components/app-search.tsx`

**Interfaces:**
- Consumes: `fetchDashboardOpenPullPages(query: DashboardOpenPullPagesQuery): Promise<DashboardOpenPullPages>` from `apps/web/src/lib/dashboard-api.ts`.
- Produces: `AppSearch()` with recent open PR result buttons that navigate to `/{org}/{repo}/pull/{number}/chapters/1`.

- [ ] **Step 1: Replace the dashboard mock and add realistic open-PR fixtures**

In `apps/web/src/components/app-search.test.tsx`, hoist the API mock and add a fixture builder:

```tsx
const dashboardApi = vi.hoisted(() => ({
  fetchDashboardOpenPullPages: vi.fn(),
}));

vi.mock("@/lib/dashboard-api", () => ({
  fetchDashboardOpenPullPages: dashboardApi.fetchDashboardOpenPullPages,
}));

function pull(number: number, title: string, updatedAt: string) {
  return {
    id: `folio-${number}`,
    org: "KMGeon",
    repo: "Folio",
    number,
    title,
    author: "reviewer",
    updatedAt,
    headBranch: `feature-${number}`,
    baseBranch: "main",
    status: "ready" as const,
    chapterCount: 2,
    viewedChapters: 0,
    changedFiles: 3,
    additions: 20,
    deletions: 4,
    risk: "low" as const,
  };
}

function openPages(items = [pull(101, "Newest change", "방금")]) {
  return {
    ready: { items, nextCursor: null, count: items.length },
    yours: { items: [], nextCursor: null, count: 0 },
    other: { items: [], nextCursor: null, count: 0 },
  };
}
```

Set `dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(openPages())` in `afterEach` after clearing mocks.

- [ ] **Step 2: Write the failing recent-results behavior test**

Replace the test that activates the dashboard page result with:

```tsx
it("shows recent open PRs without page commands and navigates to review", async () => {
  dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(
    openPages([
      pull(98, "Older change", "2시간 전"),
      pull(99, "Newest change", "4분 전"),
    ]),
  );
  const container = await mount(React.createElement(AppSearch));

  await click(getButton(container, "검색"));
  await flushPromises();

  expect(dashboardApi.fetchDashboardOpenPullPages).toHaveBeenCalledWith({
    limit: 10,
    ordering: "updated",
    direction: "desc",
    showDrafts: true,
  });
  expect(container.textContent).not.toContain("대시보드");
  const results = getDialogButtons(container);
  expect(results.map((button) => button.textContent)).toEqual([
    expect.stringContaining("Folio#99"),
    expect.stringContaining("Folio#98"),
  ]);

  await click(results[0]!);
  expect(navigation.push).toHaveBeenCalledWith("/KMGeon/Folio/pull/99/chapters/1");
});
```

Add these focused test helpers:

```tsx
function getDialogButtons(container: ParentNode) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @folio/web test -- app-search.test.tsx -t "shows recent open PRs"
```

Expected: FAIL because `AppSearch` calls the removed `fetchDashboard` mock and still renders `대시보드`, `설치`, and `설정`.

- [ ] **Step 4: Implement open-page merging and recent ordering**

In `apps/web/src/components/app-search.tsx`, replace the `fetchDashboard` import, static routes, and lazy-load effect with the open-pages API and focused mapping functions:

```tsx
import {
  type DashboardOpenPullPages,
  type DashboardPull,
  fetchDashboardOpenPullPages,
} from "@/lib/dashboard-api";

const RESULT_LIMIT = 10;

function relativeMinutes(value: string): number {
  if (value === "방금") return 0;
  const amount = Number.parseInt(value, 10);
  if (!Number.isFinite(amount)) return Number.POSITIVE_INFINITY;
  if (value.includes("분")) return amount;
  if (value.includes("시간")) return amount * 60;
  if (value.includes("일")) return amount * 24 * 60;
  return Number.POSITIVE_INFINITY;
}

function recentSearchItems(pages: DashboardOpenPullPages): SearchItem[] {
  const unique = new Map<string, DashboardPull>();
  for (const page of [pages.ready, pages.yours, pages.other]) {
    for (const item of page.items) {
      if ("status" in item) unique.set(item.id, item);
    }
  }
  return [...unique.values()]
    .sort((left, right) => relativeMinutes(left.updatedAt) - relativeMinutes(right.updatedAt))
    .slice(0, RESULT_LIMIT)
    .map((item) => ({
      label: `${item.org}/${item.repo}#${item.number} · ${item.title}`,
      href: `/${item.org}/${item.repo}/pull/${item.number}/chapters/1`,
      group: "PR",
    }));
}
```

Initialize results as empty and request recent open pages when the modal opens:

```tsx
const [items, setItems] = useState<SearchItem[]>([]);

useEffect(() => {
  if (!open) return;
  void fetchDashboardOpenPullPages({
    limit: RESULT_LIMIT,
    ordering: "updated",
    direction: "desc",
    showDrafts: true,
  })
    .then((pages) => setItems(recentSearchItems(pages)))
    .catch(() => setItems([]));
}, [open]);
```

Remove the client-side `filtered` calculation and render `items` directly in the existing result-button branch. Keep the existing `결과 없음` branch until Task 2 replaces it with explicit request states.

- [ ] **Step 5: Run the component tests and verify GREEN**

Run:

```bash
pnpm --filter @folio/web test -- app-search.test.tsx
```

Before running, add `await flushPromises()` after opening the dialog in the Tab-focus test so its result button exists. Expected: all `AppSearch` tests pass.

- [ ] **Step 6: Commit recent PR result behavior**

```bash
git add apps/web/src/components/app-search.tsx apps/web/src/components/app-search.test.tsx
git commit -m "fix(web): show recent PRs in global search"
```

---

### Task 2: Add debounced search and explicit request states

**Files:**
- Modify: `apps/web/src/components/app-search.test.tsx`
- Modify: `apps/web/src/components/app-search.tsx`

**Interfaces:**
- Consumes: the recent-results state and `recentSearchItems` mapping from Task 1.
- Produces: debounced `q` requests, stale-response protection, and loading/empty/error/retry UI in `AppSearch()`.

- [ ] **Step 1: Add failing tests for query forwarding and request states**

Enable fake timers only inside the debounced-search test and assert the exact API request:

```tsx
it("debounces the query and searches open PRs", async () => {
  vi.useFakeTimers();
  try {
    const container = await mount(React.createElement(AppSearch));
    await click(getButton(container, "검색"));
    await flushPromises();
    dashboardApi.fetchDashboardOpenPullPages.mockClear();
    dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(
      openPages([pull(120, "Search match", "5분 전")]),
    );

    await changeInput(getSearchInput(container), "Search match");
    expect(dashboardApi.fetchDashboardOpenPullPages).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(200));

    expect(dashboardApi.fetchDashboardOpenPullPages).toHaveBeenCalledWith({
      limit: 10,
      q: "Search match",
      ordering: "updated",
      direction: "desc",
      showDrafts: true,
    });
    expect(container.textContent).toContain("Folio#120");
  } finally {
    vi.useRealTimers();
  }
});
```

Add explicit tests for request states and retry:

```tsx
it("shows loading and empty states for recent open PRs", async () => {
  dashboardApi.fetchDashboardOpenPullPages.mockReturnValue(new Promise(() => {}));
  const loadingContainer = await mount(React.createElement(AppSearch));
  await click(getButton(loadingContainer, "검색"));
  expect(loadingContainer.textContent).toContain("불러오는 중");

  await act(async () => mountedRoots.pop()?.unmount());
  dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(openPages([]));
  const emptyContainer = await mount(React.createElement(AppSearch));
  await click(getButton(emptyContainer, "검색"));
  await flushPromises();
  expect(emptyContainer.textContent).toContain("열린 PR이 없습니다");
});

it("shows an error and retries the open PR request", async () => {
  dashboardApi.fetchDashboardOpenPullPages
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(openPages());
  const container = await mount(React.createElement(AppSearch));
  await click(getButton(container, "검색"));
  await flushPromises();
  expect(container.textContent).toContain("검색 결과를 불러오지 못했습니다");

  await click(getButton(container, "다시 시도"));
  await flushPromises();
  expect(dashboardApi.fetchDashboardOpenPullPages).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Folio#101");
});

it("ignores a response from an older query", async () => {
  vi.useFakeTimers();
  try {
    const recent = deferred<ReturnType<typeof openPages>>();
    dashboardApi.fetchDashboardOpenPullPages
      .mockReturnValueOnce(recent.promise)
      .mockResolvedValueOnce(openPages([pull(120, "Current match", "방금")]));
    const container = await mount(React.createElement(AppSearch));
    await click(getButton(container, "검색"));

    await changeInput(getSearchInput(container), "Current");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(container.textContent).toContain("Current match");

    await act(async () => recent.resolve(openPages([pull(98, "Stale result", "방금")])));
    expect(container.textContent).not.toContain("Stale result");
  } finally {
    vi.useRealTimers();
  }
});
```

Add deterministic input helpers:

```tsx
function getSearchInput(container: ParentNode) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="PR 검색"]');
  if (!input) throw new Error("Search input not found");
  return input;
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
pnpm --filter @folio/web test -- app-search.test.tsx -t "debounces|loading|empty|retry"
```

Expected: FAIL because query changes do not call the API and request-state messages do not exist.

- [ ] **Step 3: Implement debounced query requests with stale-response protection**

Add `SEARCH_DEBOUNCE_MS = 200` and `retryVersion` state. Replace Task 1's request effect with:

```tsx
const [retryVersion, setRetryVersion] = useState(0);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(false);
const requestIdRef = useRef(0);

useEffect(() => {
  if (!open) return;
  const requestId = ++requestIdRef.current;
  const normalizedQuery = query.trim();
  setLoading(true);
  setError(false);
  const runSearch = () => {
    void fetchDashboardOpenPullPages({
        limit: RESULT_LIMIT,
        ...(normalizedQuery ? { q: normalizedQuery } : {}),
        ordering: "updated",
        direction: "desc",
        showDrafts: true,
      })
      .then((pages) => {
        if (requestId === requestIdRef.current) setItems(recentSearchItems(pages));
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setError(true);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  };
  const timeout = normalizedQuery
    ? window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS)
    : undefined;
  if (!normalizedQuery) runSearch();
  return () => {
    requestIdRef.current += 1;
    if (timeout !== undefined) window.clearTimeout(timeout);
  };
}, [open, query, retryVersion]);
```

- [ ] **Step 4: Render loading, error, retry, and empty states**

Change both the compact trigger and modal input copy to `PR 검색`. Replace the results branch with state-specific content:

```tsx
{loading ? (
  <SearchMessage>불러오는 중</SearchMessage>
) : error ? (
  <div className="flex flex-col items-center gap-2 px-2 py-6">
    <SearchMessage>검색 결과를 불러오지 못했습니다</SearchMessage>
    <button type="button" onClick={() => setRetryVersion((value) => value + 1)}>
      다시 시도
    </button>
  </div>
) : items.length === 0 ? (
  <SearchMessage>{query.trim() ? "검색 결과가 없습니다" : "열린 PR이 없습니다"}</SearchMessage>
) : (
  items.map((item) => (
    <button
      key={item.href}
      type="button"
      onClick={() => go(item.href)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
    >
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
        {item.group}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/90">{item.label}</span>
    </button>
  ))
)}
```

Define the message component and use the complete retry-button classes below:

```tsx
function SearchMessage({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-6 text-center font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}

className="h-7 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:outline-none"
```

Import `ReactNode` as a type from React. Do not introduce a new primitive for this single local action.

- [ ] **Step 5: Verify focused behavior and all web tests**

Run:

```bash
pnpm --filter @folio/web test -- app-search.test.tsx
pnpm --filter @folio/web test
pnpm --filter @folio/web typecheck
pnpm lint
```

Expected: all commands exit 0 with no warnings or errors.

- [ ] **Step 6: Commit search requests and states**

```bash
git add apps/web/src/components/app-search.tsx apps/web/src/components/app-search.test.tsx
git commit -m "fix(web): search open PRs from global modal"
```

---

### Task 3: Repository verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed global PR search behavior from Tasks 1 and 2.
- Produces: verification evidence that the monorepo remains healthy.

- [ ] **Step 1: Run the required repository checks**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all four commands exit 0. If a command fails, use `superpowers:systematic-debugging` to identify whether the failure is caused by this change before modifying code.

- [ ] **Step 2: Inspect the final diff and worktree**

```bash
git diff HEAD~2 --check
git diff HEAD~2 -- apps/web/src/components/app-search.tsx apps/web/src/components/app-search.test.tsx
git status --short
```

Expected: no whitespace errors, only the planned search component/test changes plus the approved design and plan commits, and a clean worktree.
