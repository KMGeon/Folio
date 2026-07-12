# Dashboard PR Index + SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement remaining tasks
> task-by-task. Steps use checkbox (`- [ ]` / `- [x]`) syntax for tracking.
>
> **Spec:** [`docs/superpowers/specs/2026-07-12-dashboard-pr-index-sse-design.md`](../specs/2026-07-12-dashboard-pr-index-sse-design.md)

**Goal:** Make Folio’s open-PR board fast on first load and near real-time by serving
lists from a webhook-maintained Postgres projection and pushing updates over SSE.

**Architecture:** GitHub webhooks and backfill jobs write `pull_request_index`. When
`DASHBOARD_READ_FROM_INDEX=true`, dashboard open/completed pages read only the index
(plus a batch review-status join). `BoardEventHub` fans out light SSE events; the
web client patches cards and debounces open-board refetches. Review decomposition
jobs stay independent of the list projection.

**Tech Stack:** NestJS, Postgres + Drizzle, existing SKIP-LOCKED job queue, Next.js
client `EventSource`, GitHub App Octokit for write-path backfill only.

## Global Constraints

- Open-board **read path** must perform **zero** GitHub `pulls.list` / `pulls.get` calls when the index flag is on.
- Webhook HTTP responses stay **202 best-effort**; index/SSE failures must not become 5xx to GitHub.
- Bucket semantics (`ready` / `yours` / `other` / `completed`) and card field shapes stay compatible with the existing board UI.
- List projection lives in **`pull_request_index`**, separate from review entity **`pull_requests`**.
- Soft join key: `(repo_id, github_pr_number)` — no FK from index → `pull_requests`.
- While flag is on, only repos with `pr_index_status = ready` appear on the board.
- File names must be domain-concrete (no `helpers` / `utils` dumping grounds).
- Never add `max-lines` disables; split files instead.
- Never bypass pre-commit with `--no-verify`.

## Implementation status (as of 2026-07-12)

| Area                                     | Status          | Notes                                                             |
| ---------------------------------------- | --------------- | ----------------------------------------------------------------- |
| Schema + migration `0013`                | **Done**        | `pull_request_index`, repo `pr_index_*` columns                   |
| Index writer + webhook actions           | **Done**        | Best-effort upsert; review enqueue still runs if index fails      |
| Backfill job `pr_index_backfill`         | **Done**        | Enqueued on folio enable; worker handles kind                     |
| Index read path + flag                   | **Done**        | Flag default **`false`** for safe deploy                          |
| Batch review status                      | **Done**        | `resolveDashboardPullStatuses`                                    |
| SSE stream + hub                         | **Done**        | `GET /api/v1/dashboard/stream`                                    |
| Frontend EventSource                     | **Done**        | `connectDashboardBoardStream`                                     |
| Reconcile job (~15m)                     | **Done**        | Worker runs bounded sequential rounds every ~15m                  |
| Bulk backfill for already-enabled repos  | **Done (code)** | Enqueue command is ready; target environment run remains ops work |
| Delete dead GitHub list cache from reads | **Partial**     | Flag off still uses live GitHub path                              |
| Index read-path hardening tests          | **Done**        | Flag-on zero-Octokit, ready-only, filters, completed range        |
| Production flag `true`                   | **Ops pending** | Task 11 cutover checklist; no production flag changed             |

**Landing commit (core):** `9b9157e` — `feat: add PR index projection and dashboard SSE`  
**Design commit:** `fe46d59` — `docs: add dashboard PR index + SSE design`

---

## File map

### Created (landed)

| Path                                                                       | Responsibility                            |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/db/drizzle/0013_pull_request_index.sql`                          | Migration: table + repo columns + indexes |
| `packages/db/src/schema/pull-request-index.ts`                             | Drizzle schema for list projection        |
| `packages/db/src/repos/pull-request-index.ts`                              | Upsert (stale guard), list, delete, prune |
| `apps/backend/src/application/dashboard/board-event-hub.ts`                | In-process SSE fan-out by repo scope      |
| `apps/backend/src/application/dashboard/board-event-hub.test.ts`           | Hub scope filtering tests                 |
| `apps/backend/src/application/dashboard/pull-request-index-writer.ts`      | Map GitHub PR → upsert + publish          |
| `apps/backend/src/application/dashboard/pull-request-index-writer.test.ts` | Writer unit tests                         |
| `apps/backend/src/application/dashboard/pull-request-index-backfill.ts`    | Enqueue + run backfill for one repo       |
| `apps/backend/src/application/dashboard/dashboard-review-status-batch.ts`  | Batch review status for list cards        |
| `apps/backend/src/application/dashboard/dashboard-index-pull-map.ts`       | Map/filter/page helpers for index reads   |
| `apps/backend/src/application/dashboard/dashboard-index-pull-page.ts`      | `getDashboard*FromIndex` entry points     |
| `apps/web/src/components/dashboard/dashboard-board-stream.ts`              | EventSource connect + patch/refetch       |

### Modified (landed)

| Path                                                                | Change                                           |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/db/src/schema/repositories.ts`                            | `prIndexStatus`, `prIndexBackfilledAt`           |
| `packages/db/src/repos/repositories.ts`                             | `setPrIndexStatus`, enable resets index meta     |
| `packages/types/src/job.ts`                                         | `JOB_KIND.PR_INDEX_BACKFILL` + payload schema    |
| `packages/db/src/schema/jobs.ts`                                    | Kind enum includes backfill                      |
| `apps/backend/src/config.ts`                                        | `DASHBOARD_READ_FROM_INDEX` (default `false`)    |
| `apps/backend/src/domain/github/github-webhook.service.ts`          | Index PR actions + best-effort upsert            |
| `apps/backend/src/application/dashboard/dashboard.facade.ts`        | Flag-gated index vs GitHub read                  |
| `apps/backend/src/application/dashboard/dashboard.module.ts`        | Export hub/writer/backfill                       |
| `apps/backend/src/application/repositories/repositories.facade.ts`  | Enable → enqueue backfill; disable → clear index |
| `apps/backend/src/application/repositories/repositories.module.ts`  | Import `DashboardModule`                         |
| `apps/backend/src/interfaces/api/dashboard/dashboard.controller.ts` | `GET stream` SSE                                 |
| `apps/backend/src/worker.ts`                                        | Claim/run `pr_index_backfill`                    |
| `apps/web/src/lib/dashboard-api.ts`                                 | `BoardStreamEvent`, `dashboardStreamUrl`         |
| `apps/web/src/components/dashboard/dashboard-board-client.tsx`      | Wire SSE effect                                  |

### Follow-up files (Tasks 9–12)

| Path                                                                          | Responsibility                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/backend/src/application/dashboard/pull-request-index-reconcile.ts`      | Diff GitHub open set vs index; converge                |
| `apps/backend/src/application/dashboard/pull-request-index-reconcile.test.ts` | Reconcile unit tests                                   |
| `apps/backend/src/worker.ts`                                                  | Schedule or claim reconcile work                       |
| `apps/backend/src/application/dashboard/pull-request-index-backfill-all.ts`   | Bulk enqueue backfill for all eligible non-ready repos |
| `apps/backend/src/scripts/enqueue-pr-index-backfill.ts`                       | Runnable bulk enqueue operations entry                 |
| `apps/backend/src/application/dashboard/dashboard-index-pull-page.test.ts`    | Index read-path cutover regression coverage            |
| Env / deploy docs                                                             | Cutover and rollback                                   |

---

## Completed tasks (reference)

### Task 1: Schema + migration — **DONE**

**Files:**

- Create: `packages/db/drizzle/0013_pull_request_index.sql`
- Create: `packages/db/src/schema/pull-request-index.ts`
- Modify: `packages/db/src/schema/repositories.ts`
- Modify: `packages/db/src/repos/pull-request-index.ts`, `repositories.ts`, journal

- [x] **Step 1:** Add `pull_request_index` table (unique `(repo_id, github_pr_number)`, sort indexes)
- [x] **Step 2:** Add `repositories.pr_index_status` (`idle|backfilling|ready|error`) + `pr_index_backfilled_at`
- [x] **Step 3:** Export schema/repo from `@folio/db`
- [x] **Step 4:** Register migration in `packages/db/drizzle/meta/_journal.json`

**Apply locally / prd:**

```bash
pnpm --filter @folio/db db:migrate
```

Expected: migration `0013_pull_request_index` applied without error.

### Task 2: Index writer + BoardEventHub — **DONE**

**Files:**

- Create: `board-event-hub.ts`, `pull-request-index-writer.ts` + tests

**Interfaces:**

- Produces: `PullRequestIndexWriter.applyPull`, `clearRepo`
- Produces: `BoardEventHub.subscribe` / `publish` with event types  
  `pr.upserted` | `pr.removed` | `board.invalidate`

- [x] Upsert rejects older `github_updated_at` (out-of-order webhook guard)
- [x] Publish scoped SSE events after successful upsert/clear
- [x] Tests: `board-event-hub.test.ts`, `pull-request-index-writer.test.ts`

### Task 3: Webhook index side-effects — **DONE**

**Files:**

- Modify: `apps/backend/src/domain/github/github-webhook.service.ts`

Index actions: `opened`, `synchronize`, `reopened`, `ready_for_review`,
`converted_to_draft`, `edited`, `closed`, `labeled`, `unlabeled`.

- [x] Folio-disabled repos skip index and review job
- [x] Index upsert failures are logged and **do not** block `enqueueReviewPull`
- [x] Reviewable actions still enqueue `review_pull`

### Task 4: Backfill job — **DONE**

**Files:**

- Create: `pull-request-index-backfill.ts`
- Modify: `packages/types/src/job.ts`, worker, repositories facade

- [x] `JOB_KIND.PR_INDEX_BACKFILL` payload `{ repositoryId }`
- [x] On folio enable → `enqueueForRepository`
- [x] On disable → `clearRepo`
- [x] Worker runs open paginate + bounded recent closed + prune + `ready` status
- [x] Publish `board.invalidate` reason `backfill_complete`

### Task 5: Index read path + flag — **DONE**

**Files:**

- Create: `dashboard-index-pull-page.ts`, `dashboard-index-pull-map.ts`
- Modify: `dashboard.facade.ts`, `config.ts`

```ts
// config default
DASHBOARD_READ_FROM_INDEX: false; // set true after backfill ready
```

- [x] `getOpenPullPagesForUser` / `getPullPageForUser` branch on flag
- [x] Only `pr_index_status === ready` repos included
- [x] Preserve open bucket partition rules via `openBucketFor` / `partitionOpenCandidates`

### Task 6: Batch review status — **DONE**

**Files:**

- Create: `dashboard-review-status-batch.ts`

- [x] `resolveDashboardPullStatuses(userId, keys) → Map<`${repoId}:${prNumber}`, status>`
- [x] Shared job map via `getLatestJobsByDedupeKeys`

### Task 7: SSE endpoint — **DONE**

**Files:**

- Modify: `dashboard.controller.ts` (`GET stream`)
- Modify: controller tests with hub + repoAccess mocks

- [x] Session + entitlement guards
- [x] `text/event-stream`, heartbeat comments, scope filter by readable repos
- [x] Does not wrap body in JSON success envelope (raw `res.write`)

### Task 8: Frontend stream client — **DONE**

**Files:**

- Create: `dashboard-board-stream.ts`
- Modify: `dashboard-board-client.tsx`, `dashboard-api.ts`

- [x] `EventSource(dashboardStreamUrl(apiBase), { withCredentials: true })`
- [x] In-place patch on `pr.upserted`; remove on `pr.removed`
- [x] Debounced open reload (~400ms); reload on invalidate/reconnect

**Verify completed slice:**

```bash
pnpm --filter @folio/backend typecheck
pnpm --filter @folio/web typecheck
pnpm --filter @folio/backend test
pnpm --filter @folio/web test
```

Expected: all pass (as of landing commit).

---

## Remaining tasks

### Task 9: Reconcile job (GitHub ↔ index convergence)

**Why:** Spec success criterion — missed webhooks / downtime must converge within ~15 minutes.

**Files:**

- Create: `apps/backend/src/application/dashboard/pull-request-index-reconcile.ts`
- Create: `apps/backend/src/application/dashboard/pull-request-index-reconcile.test.ts`
- Modify: `apps/backend/src/worker.ts` (or a light scheduler loop in API process — prefer worker)
- Modify: `packages/types/src/job.ts` if using `JOB_KIND.PR_INDEX_RECONCILE`  
  **or** worker-internal timer without new kind (allowed if simpler)

**Interfaces:**

- Consumes: `PullRequestIndexWriter.applyPull`, `pullRequestIndexRepo`, `repositoriesRepo`, Octokit factory
- Produces: `PullRequestIndexReconcile.runForRepository(repositoryId): Promise<{ upserted: number; closed: number }>`
- Produces: optional `enqueueAllReadyRepos()` / periodic claim

- [x] **Step 1: Write failing unit test (diff open sets)**

```ts
// pull-request-index-reconcile.test.ts
import { describe, expect, it, vi } from "vitest";

describe("PullRequestIndexReconcile", () => {
  it("upserts GitHub-only opens and closes index-only opens", async () => {
    // Arrange: GitHub open = [#1, #2], index open = [#2, #3]
    // Assert: applyPull called for #1; #3 marked closed or removed from open board path
  });
});
```

- [x] **Step 2: Run test — expect FAIL** (module missing)

```bash
pnpm --filter @folio/backend exec vitest run src/application/dashboard/pull-request-index-reconcile.test.ts
```

- [x] **Step 3: Implement reconcile algorithm**

```text
for each folio_enabled && github_access_active repo (prefer ready/error first):
  1. list GitHub open PRs (paginate)
  2. list index open rows for repo_id
  3. githubOnly → writer.applyPull
  4. indexOnly → writer.applyPull with state closed + closed_at=now
     (or delete if never seen on GitHub and not in closed window)
  5. optionally refresh recent closed window like backfill
  6. pruneClosedOlderThan(97d)
  7. if any mismatch resolved → hub.publish({ type: "board.invalidate", reason: "reconcile", repoId })
```

Keep GitHub traffic **only** on this path and backfill — never on user REST when flag is true.

- [x] **Step 4: Schedule**

Preferred: worker loop every 15 minutes:

```ts
// conceptual — place near worker loop
const RECONCILE_MS = 15 * 60_000;
let lastReconcile = 0;
// each iteration after job claim miss:
if (Date.now() - lastReconcile > RECONCILE_MS) {
  lastReconcile = Date.now();
  await reconcile.runRound({ limitRepos: 10 }); // bound rate
}
```

- [x] **Step 5: Tests pass + commit**

```bash
pnpm --filter @folio/backend exec vitest run src/application/dashboard/pull-request-index-reconcile.test.ts
pnpm --filter @folio/backend typecheck
git add apps/backend/src/application/dashboard/pull-request-index-reconcile.ts \
  apps/backend/src/application/dashboard/pull-request-index-reconcile.test.ts \
  apps/backend/src/worker.ts
git commit -m "feat(dashboard): reconcile pull_request_index with GitHub"
```

---

### Task 10: Bulk backfill for already folio-enabled repos

**Why:** Cutover requires `pr_index_status=ready` on active repos. Enable-path only backfills on **toggle**, not repos already enabled before this feature.

**Files (pick one approach):**

- **A (recommended):** small backend method + one-off script under `packages/db` or `apps/backend/scripts`
- **B:** SQL + manual enqueue via worker only

**Interfaces:**

- Consumes: `PullRequestIndexBackfill.enqueueForRepository`
- Produces: enqueued job per enabled repo with status not `ready` (or force all)

- [x] **Step 1: Implement enqueue helper**

```ts
// e.g. apps/backend/src/application/dashboard/pull-request-index-backfill-all.ts
export async function enqueueBackfillForEnabledRepos(
  backfill: PullRequestIndexBackfill,
): Promise<{ enqueued: number }> {
  const { repositoriesRepo } = await import("@folio/db");
  // list folio_enabled && github_access_active
  // for each where pr_index_status !== 'ready' (or all): await backfill.enqueueForRepository(id)
  return { enqueued: n };
}
```

- [x] **Step 2: Runnable entry (dev/ops)**

```bash
# Example once script exists:
pnpm --filter @folio/backend enqueue:pr-index-backfill
```

Expected stdout: `enqueued: N`

- [ ] **Step 3: Ensure workers running until all ready**

```sql
SELECT pr_index_status, count(*)
FROM repositories
WHERE folio_enabled = true AND github_access_active = true
GROUP BY 1;
```

Expected before cutover: all active enabled rows `ready` (or explicit acceptance of excluding non-ready).

- [x] **Step 4: Commit**

```bash
git commit -m "feat(dashboard): bulk enqueue pr_index_backfill for enabled repos"
```

---

### Task 11: Cutover + rollback runbook

**Status:** Runbook documented. Target-environment execution remains intentionally pending;
no production flag or database state was changed by this implementation.

**Files:**

- Modify: this plan’s status table after cutover
- Optional: `.env.example` / deploy skill notes with `DASHBOARD_READ_FROM_INDEX`

- [ ] **Step 1: Preflight**

1. Migration `0013` applied on target DB
2. API + worker processes running
3. Task 10 complete — enabled repos mostly/all `ready`
4. Webhook deliveries healthy (GitHub App → `/webhooks/github`)

- [ ] **Step 2: Enable flag**

```bash
# backend env
DASHBOARD_READ_FROM_INDEX=true
# restart API (and workers if they cache env)
```

- [ ] **Step 3: Smoke**

1. Open dashboard — open columns populate without multi-second GitHub lag
2. Create/edit a PR on an enabled repo — card appears/updates within ~5s with SSE tab open
3. Disconnect network briefly / kill SSE — REST refresh still works
4. Global PR search still returns open PRs (uses open pages API)

- [ ] **Step 4: Rollback (if needed)**

```bash
DASHBOARD_READ_FROM_INDEX=false
# restart API
```

Index continues to update via webhooks/backfill while flag is false (writes stay on).

- [ ] **Step 5: Post-cutover cleanup (optional, separate PR)**

- Remove or shrink process-local dashboard GitHub list cache usage on the legacy path
- Add facade test that when flag true, mock Octokit is never called for open pages
- Document default flip to `true` in prd env template once stable

---

### Task 12: Hardening tests for index read path (recommended before default-true)

**Files:**

- Create: `apps/backend/src/application/dashboard/dashboard-index-pull-page.test.ts`
- Modify: `dashboard.facade.test.ts` only if needed with env isolation

- [x] **Step 1:** When `DASHBOARD_READ_FROM_INDEX=true`, open pages return buckets from seeded index rows without calling `listPulls`
- [x] **Step 2:** Non-ready repos excluded even if folio_enabled
- [x] **Step 3:** `showDrafts=false` filters drafts; `q` matches title/author/repo/number
- [x] **Step 4:** Completed respects `closedRange`

```bash
pnpm --filter @folio/backend exec vitest run src/application/dashboard/dashboard-index-pull-page.test.ts
```

- [x] **Step 5: Commit**

```bash
git commit -m "test(dashboard): cover index-backed open and completed pages"
```

---

## Env reference

| Variable                    | Default | Meaning                                                       |
| --------------------------- | ------- | ------------------------------------------------------------- |
| `DASHBOARD_READ_FROM_INDEX` | `false` | `true` → board/completed pages from `pull_request_index` only |

Parsed in `apps/backend/src/config.ts` as boolean via `"true"|"false"` enum transform.

---

## Verification matrix

| Layer                   | Command                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types                   | `pnpm --filter @folio/types typecheck && pnpm --filter @folio/db typecheck && pnpm --filter @folio/backend typecheck && pnpm --filter @folio/web typecheck` |
| Backend tests           | `pnpm --filter @folio/backend test`                                                                                                                         |
| Web tests               | `pnpm --filter @folio/web test`                                                                                                                             |
| Repo gate (before push) | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`                                                                                                    |

---

## Spec coverage checklist

| Spec requirement                                          | Task                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `pull_request_index` separate from review `pull_requests` | Task 1 (done)                                                     |
| Webhook upsert + broader PR actions                       | Task 3 (done)                                                     |
| Backfill on enable                                        | Task 4 (done)                                                     |
| DB-only reads behind flag                                 | Task 5 (done)                                                     |
| Batch review join                                         | Task 6 (done)                                                     |
| SSE + light events + debounced refetch                    | Tasks 7–8 (done)                                                  |
| Reconcile ~15m                                            | Task 9 (done)                                                     |
| Bulk backfill before cutover                              | Task 10 (code done; environment run pending)                      |
| Flag cutover / rollback                                   | Task 11 (runbook done; cutover pending)                           |
| Read-path regression tests for index                      | Task 12 (done)                                                    |
| Optional UI polish of “New/Open” page                     | **Out of scope** for this plan (data plane only; separate design) |

---

## Non-goals (do not implement under this plan)

- WebSocket
- Durable webhook outbox table
- Reviewers / assignees / CI columns on index (v1)
- Client → GitHub direct calls for the board
- Chapter/diff review pipeline redesign
- Full visual redesign of the open PR page
