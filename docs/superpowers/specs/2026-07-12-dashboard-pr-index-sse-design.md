# Dashboard PR Index + SSE Design

## Goal

Make Folio’s open-PR board (and related open-PR surfaces) both **fast on first load**
and **near real-time** when GitHub PRs change.

Success criteria:

| Goal             | Criterion                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Fast first paint | Open-board request performs **zero** GitHub list/detail calls; p95 &lt; 500ms under normal DB load (≤50 enabled repos, ≤500 open PRs) |
| Near real-time   | With an active SSE connection, webhook-driven changes appear in the UI within **5 seconds**                                           |
| Consistency      | Periodic reconcile converges Folio’s open set with GitHub within the reconcile interval (target **15 minutes**)                       |
| Resilience       | Board remains fully usable via REST if SSE is down                                                                                    |
| Compatibility    | Existing open/completed bucket semantics, card fields, and cursor pagination shape stay intact                                        |

This continues the longer-term direction called out in
[`2026-07-10-dashboard-cold-start-design.md`](./2026-07-10-dashboard-cold-start-design.md):
a webhook-maintained database projection for the dashboard list.

## Problem

Today the dashboard open list is built on the **read path** by calling GitHub live:

1. For each folio-enabled repository, paginate `pulls.list` for open PRs.
2. Enrich visible cards with pull details (line counts) under bounded concurrency.
3. Merge Folio review status from the database.
4. Rely on a **process-local** TTL cache (open ~2 minutes) that is not shared across
   instances and does not push updates to clients.

That produces three coupled failures:

1. **Slow** — page load work scales with repos × open PRs × detail calls.
2. **Not real-time** — TTL cache + no client push; new PRs wait for expiry/refetch.
3. **Real-time via API makes it worse** — polling GitHub multiplies the same cost.

Webhooks already exist, but they primarily enqueue **review decomposition jobs**.
They do not maintain a list projection for the board.

## Chosen approach

**Approach A: webhook-maintained PR index + DB-only reads + SSE**

```text
GitHub webhook / backfill / reconcile
  → upsert pull_request_index
  → publish board events

Dashboard REST
  → SELECT index + batch review join only (no GitHub)

Dashboard SSE
  → light pr.upserted | pr.removed | board.invalidate

Web client
  → first paint from REST
  → live meta patch from SSE
  → debounced open reload for bucket/count consistency
```

### Alternatives considered

| Approach                                       | Summary                             | Why not for this goal                                                             |
| ---------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Shared cache + SWR + webhook invalidation      | Redis/cache in front of live GitHub | Improves average latency but cold/miss paths stay slow; refresh still hits GitHub |
| Client/server polling of GitHub Search/GraphQL | Always live from GitHub             | Conflicts with fast + cheap real-time; rate limits and cost                       |

### Real-time transport

**SSE (Server-Sent Events)** is the chosen push channel.

- One-way server → client is enough for board updates.
- Works with existing cookie session auth on same origin.
- Simpler than WebSocket for this use case.

SSE payload policy (v1):

- Push **light identity + GitHub meta** (or full card meta without re-deriving all
  review joins when cheap).
- Client **patches in place** when the card already exists.
- Client runs a **debounced open-board refetch** (300–500ms) so bucket moves and
  counts reconverge from the DB source of truth.
- No durable webhook outbox in v1; reconnect does one full open reload.

## Architecture

### Role split

| Concern                                     | Source of truth                                |
| ------------------------------------------- | ---------------------------------------------- |
| Board / open-list cards                     | `pull_request_index` in Postgres               |
| Review lifecycle (chapters, jobs, analysis) | Existing `pull_requests` / revisions / jobs    |
| Diff and review content                     | GitHub + existing review read path (unchanged) |

### High-level flow

```text
┌──────────────┐  pull_request events              ┌──────────────────────────┐
│    GitHub    │ ─────────────────────────────────► │ Webhook handler (extend) │
└──────────────┘                                    │ 1) index upsert            │
                                                    │ 2) review job (existing)   │
                                                    │ 3) BoardEventHub publish   │
                                                    └────────────┬─────────────┘
                                                                 │
                              ┌──────────────────────────────────┼──────────────────┐
                              ▼                                  ▼                  ▼
                       Postgres                          SSE hub              Review queue
                  pull_request_index                  (scoped fan-out)        (unchanged)
                              ▲                                  │
                              │ SELECT                           │
                       Dashboard REST                     EventSource client
                       open / bucket pages                /dashboard/stream
```

### Non-goals (this design)

- WebSocket full duplex
- Durable event outbox table
- Reviewers / assignees / CI columns on the index (v1)
- Client calls to GitHub for the board
- Redesign of chapter/diff review pipeline
- Full visual redesign of the “New/Open” page (data plane first; UI polish optional later)

## Data model

### Separate list projection from review entity

- Keep **`pull_requests`** as the review lifecycle entity (FK target for revisions,
  chapters, comments).
- Add **`pull_request_index`** as the board/list projection.
- An open PR may exist only in the index until a Folio review is requested/created.
- Join key: `(repo_id, github_pr_number)` — soft join, no FK from index → `pull_requests`.

### Table: `pull_request_index`

```text
pull_request_index
├─ id                    uuid PK
├─ created_at            timestamptz
├─ updated_at            timestamptz          -- Folio row touch time
├─ repo_id               uuid FK → repositories ON DELETE CASCADE
├─ github_pr_number      int
├─ title                 text
├─ author_login          text
├─ base_ref              text
├─ head_ref              text
├─ head_sha              text
├─ github_state          text                 -- open | closed
├─ is_draft              boolean
├─ merged_at             timestamptz null
├─ closed_at             timestamptz null
├─ github_updated_at     timestamptz          -- GitHub updated_at (sort key)
├─ additions             int not null default 0
├─ deletions             int not null default 0
├─ changed_files         int not null default 0
├─ labels_json           jsonb not null default []  -- [{name, color}]
├─ html_url              text
├─ last_synced_at        timestamptz not null
└─ UNIQUE (repo_id, github_pr_number)
```

### Derived UI status (not stored)

| `githubStatus` | Rule                    |
| -------------- | ----------------------- |
| `merged`       | `merged_at IS NOT NULL` |
| `draft`        | open and `is_draft`     |
| `closed`       | closed and not merged   |
| `open`         | other open              |

### Bucket rules (unchanged product semantics)

| Bucket      | Rule                                                             |
| ----------- | ---------------------------------------------------------------- |
| `yours`     | Open-ish PR authored by current user (existing `openBucketFor`)  |
| `ready`     | Others’ PRs with Folio review progress / analysis rules as today |
| `other`     | Others’ PRs not ready                                            |
| `completed` | Merged/closed within `closedRange`                               |

Do **not** duplicate “review complete” into the index. Always join/project from the
existing review/job tables so lifecycle stays single-sourced.

### Indexes

```text
UNIQUE (repo_id, github_pr_number)
INDEX (repo_id, github_updated_at DESC)
INDEX (repo_id, github_state, github_updated_at DESC)
INDEX (author_login, github_updated_at DESC)
INDEX (repo_id, closed_at DESC)   -- optional partial WHERE closed_at IS NOT NULL
INDEX (repo_id, merged_at DESC)   -- optional partial WHERE merged_at IS NOT NULL
```

Lines ordering may use `(additions + deletions)` in SQL or a generated column later
if needed.

### Repository backfill metadata

Extend `repositories` (or a small companion table) with:

```text
pr_index_status          idle | backfilling | ready | error
pr_index_backfilled_at   timestamptz null
pr_index_cursor          text null          -- optional resume token
```

### Prune policy

| State           | Retention                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| open / draft    | Keep while repo is folio-enabled                                           |
| merged / closed | Keep **90 days + small buffer (e.g. 7 days)** from `merged_at`/`closed_at` |

Covers dashboard `closedRange` up to `90d`. Periodic prune job (or reconcile) deletes
older closed rows.

### Board stream events (not a required durable table in v1)

```ts
type BoardStreamEvent =
  | {
      type: "pr.upserted";
      id: string; // `${owner}-${repo}-${number}` stable card id
      repoId: string;
      number: number;
      githubUpdatedAt: string;
      // optional meta fields for in-place patch
    }
  | {
      type: "pr.removed";
      id: string;
      repoId: string;
      number: number;
    }
  | {
      type: "board.invalidate";
      reason: "reconcile" | "repo_scope_changed" | "backfill_complete";
    };
```

`BoardEventHub` starts in-process; interface must allow Redis pub/sub later for
multi-instance without changing SSE clients.

## Write path

### Components

| Component                   | Responsibility                                       |
| --------------------------- | ---------------------------------------------------- |
| `PullRequestIndexWriter`    | Map webhook/list payloads → upsert/delete index rows |
| `PullRequestIndexBackfill`  | Initial load per repo (all open + recent closed)     |
| `PullRequestIndexReconcile` | Periodic GitHub ↔ index convergence                  |
| `BoardEventHub`             | Scoped SSE fan-out                                   |
| Existing `ReviewJobQueue`   | Decomposition jobs; independent of index             |

Webhook HTTP semantics stay **202 best-effort**: index/SSE failures are logged and
must not turn the delivery into 5xx. Reconcile repairs drift.

### `pull_request` webhook actions

| Action                              | Index                         | Review job                       | SSE           |
| ----------------------------------- | ----------------------------- | -------------------------------- | ------------- |
| `opened`                            | upsert                        | yes if folio-enabled             | `pr.upserted` |
| `reopened`                          | upsert                        | yes                              | `pr.upserted` |
| `synchronize`                       | upsert                        | yes                              | `pr.upserted` |
| `ready_for_review`                  | upsert                        | yes                              | `pr.upserted` |
| `converted_to_draft`                | upsert                        | no                               | `pr.upserted` |
| `edited`                            | upsert                        | no                               | `pr.upserted` |
| `closed`                            | upsert (closed/merged fields) | no (keep current product policy) | `pr.upserted` |
| `labeled` / `unlabeled`             | refresh `labels_json`         | no                               | `pr.upserted` |
| assignees / review_requested / etc. | ignore in v1                  | —                                | —             |

Today only reviewable actions are handled for side effects. Indexing requires the
broader action set above.

**Disabled repos** (`folio_enabled = false`): skip index writes and review jobs.
Enabling a repo enqueues backfill.

### Payload mapping

Prefer fields present on the webhook `pull_request` object (title, author, refs,
sha, draft, state, timestamps, html_url, labels). Avoid extra GitHub calls by default.

Line counts:

- Use payload values when present.
- If missing: keep previous index values, or on `opened`/`synchronize` only issue at
  most one bounded `pulls.get` to fill stats.
- Always set `last_synced_at = now()`.

### Stale event guard

When applying an update, overwrite only if the incoming `github_updated_at` is newer
than the stored value (or equal with a newer `head_sha` / explicit field change).
Prevents out-of-order webhook delivery from regressing the row.

### Installation / activation hooks

| Trigger                                   | Write behavior                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Installation created / repositories added | Existing installation sync + enqueue backfill for new folio-enabled repos |
| Settings: folio enable                    | Enqueue backfill; set `pr_index_status = backfilling`                     |
| Settings: folio disable                   | Delete or exclude that repo’s index rows; `board.invalidate`              |
| Installation suspend/delete               | Existing disconnect + cascade cleanup + invalidate                        |

### Backfill

**Scope**

- All open PRs (including drafts), paginated.
- Recent closed/merged enough to cover 90d completed window.

**Execution**

- New job kind (e.g. `pr_index_backfill`) on the existing Postgres SKIP LOCKED queue.
- Bound concurrency (e.g. one backfill per installation, low global cap).
- Pass 1: list endpoints → fast upsert (stats may be 0).
- Pass 2: optional bounded detail fill for line counts; publish upserts as stats improve.
- On completion: `pr_index_status = ready`, `pr_index_backfilled_at = now()`,
  `board.invalidate` with reason `backfill_complete`.

**Partial board:** repos still `backfilling`/`error` are omitted from reads (v1 policy:
**only `ready` repos appear**). Other ready repos still render immediately.

### Reconcile

- Interval target: ~15 minutes, oldest/`error` repos first.
- Diff GitHub open set vs index open set for each repo.
- Upsert missing, close/remove stale opens, refresh recent closed window, prune.
- On material mismatch: `board.invalidate`.
- GitHub rate budget lives here and in backfill — **not** on user page loads.

## Read path

### API surface

| Endpoint                               | Change                                                   |
| -------------------------------------- | -------------------------------------------------------- |
| `GET /api/v1/dashboard/pulls/open`     | Implementation becomes DB-only; response shape unchanged |
| `GET /api/v1/dashboard/pulls?bucket=…` | Same                                                     |
| `GET /api/v1/dashboard` / summary      | Metrics and `openPrCount` from index aggregates          |
| `GET /api/v1/dashboard/stream`         | **New** SSE endpoint, session-authenticated              |

### Read pipeline

```text
1. Authenticate session user
2. loadDashboardWorkspaceScope (readable + folio_enabled)
3. Restrict to repos with pr_index_status = ready
4. Query pull_request_index
5. Apply open vs completed window, drafts, q
6. Batch-join review lifecycle/status (no per-PR N+1)
7. Partition ready | yours | other with existing openBucketFor rules
8. Sort (updated | lines) + direction
9. Slice pages + nextCursor
10. Map to DashboardPull / DashboardCompletedPull
```

**Hard rule:** this path must not call `pulls.list` / `pulls.get` or depend on the
process-local GitHub list cache for correctness.

### Query rules

**Open candidates**

- `github_state = 'open'`
- `showDrafts` filter
- `repo_id IN` ready + authorized repos
- `q`: case-insensitive substring on title, author, repo name, number (existing product behavior)

**Completed**

- `merged_at` or `closed_at` within `closedRange`
- Note: physical retention max is ~90d + buffer even if `closedRange=all`

**Sort**

- `updated` → `github_updated_at` + stable tie-break `(repo_id, github_pr_number)`
- `lines` → `(additions + deletions)` + same tie-break

**Pagination**

- Keep public cursor compatibility for v1 if clients already depend on it.
- Prefer keyset internally when practical; offset remains acceptable while open counts
  stay in the low hundreds per user.

### Review status batch join

Replace per-card `resolveDashboardPullStatus` call patterns on list endpoints with a
batched loader:

```text
input:  [{ repoId, number, headSha, fullName }, ...]
output: Map<key, DashboardPullStatus>
```

Batch:

1. `pull_requests` for `(repo_id, number)` pairs
2. Latest revision per PR
3. Chapter counts + user viewed progress
4. Latest jobs by dedupe keys for `analysisStatus`

Card `changedFiles` / additions / deletions on the board come from the **index**
(GitHub-facing stats, available before review exists).

### Client SSE behavior

```text
Mount:
  REST open pages + completed in parallel (existing cold-start shape)
  open EventSource /api/v1/dashboard/stream

on pr.upserted:
  patch existing card meta in place when present
  debounced reload open pages (300–500ms)

on pr.removed:
  remove card; optional debounced reload

on board.invalidate:
  immediate open reload (and completed if needed)

on reconnect (EventSource onopen after error):
  full open reload once (gap fill)

on window focus (optional):
  if quiet for >60s, reload once
```

SSE is an enhancement: without it, manual navigation/refetch still shows correct DB
state.

### Other consumers

Global PR search and any other `fetchDashboardOpenPullPages` callers automatically
benefit from the DB-backed open endpoint. No separate GitHub search path.

### Caching

| Layer                       | Role                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| Postgres index              | List source of truth                                                         |
| In-memory GitHub list cache | Remove from dashboard **read** path; optional only inside backfill/reconcile |
| HTTP cache                  | None (user-specific)                                                         |

## Error handling

| Failure                     | Handling                                             | User impact                                |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Webhook index upsert fails  | Log; still 202                                       | Temporary stale list until reconcile/retry |
| Review enqueue fails        | Existing job retry path                              | Review delayed; card meta can still update |
| Backfill fails              | `pr_index_status = error`, retry/backoff             | That repo omitted until ready              |
| Reconcile fails             | Retry next cycle                                     | Stale window ≤ reconcile interval          |
| Open REST DB error          | Standard API envelope + column retry UI              | Open columns error state                   |
| Partial review join failure | Conservative `not_requested` / `processing` fallback | Card still listed                          |
| SSE auth failure            | 401, close stream                                    | REST-only board still works                |
| SSE disconnect              | Auto-reconnect + open reload on open                 | Brief gap, then consistent                 |
| Out-of-order webhook        | Timestamp/sha guard skips older write                | Latest meta kept                           |

## Rollout

Feature flag: `DASHBOARD_READ_FROM_INDEX` (boolean env, default `false` until cutover).

| Phase   | Work                                                            | Status                                                       |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| P0      | Schema migration: `pull_request_index` + repo backfill metadata | Done                                                         |
| P1      | `PullRequestIndexWriter` + expanded webhook actions             | Done                                                         |
| P2a     | Backfill job on folio enable                                    | Done                                                         |
| P2b     | Reconcile job (~15m)                                            | Done (plan Task 9)                                           |
| P3      | Read path behind flag (open/completed → DB)                     | Done (flag default off)                                      |
| P4      | Batch review status join on list path                           | Done                                                         |
| P5      | SSE endpoint + `BoardEventHub`                                  | Done                                                         |
| P6      | Frontend EventSource + patch + debounced refetch                | Done                                                         |
| P7      | Delete dead GitHub list caching from dashboard reads            | After permanent flag-on                                      |
| P8      | Optional UI polish of open/new page                             | Out of scope (separate design)                               |
| Cutover | Bulk backfill already-enabled repos + set flag `true`           | Enqueue code done; environment run + flag remain ops pending |

Before enabling the flag in production:

1. Enqueue backfill for all already folio-enabled repositories.
2. Confirm `pr_index_status = ready` coverage.
3. Flip flag; keep instant rollback to live GitHub reads if needed.

v1 read policy while flag is on: **only repos with `pr_index_status = ready`**.

## Testing

### Writer / DB

- Upsert idempotent on `(repo_id, number)`
- Older `github_updated_at` does not overwrite newer row
- Close/merge timestamps and `github_state`
- Labels replace on labeled/unlabeled
- Prune removes closed outside retention; keeps opens

### Webhook

- `opened` / `edited` / `closed` / `synchronize` update index; reviewable actions still enqueue jobs
- Disabled repo skips index and job
- Side-effect exception still returns 202

### Backfill / reconcile

- Loads all opens + recent closed
- Converges GitHub-only and index-only diffs
- Concurrent webhook during backfill still ends consistent

### Read API

- Open pages issue **zero** GitHub calls in tests
- Bucket partition matches existing fixtures/rules
- Batch status join covers complete / not_requested / ready / yours / other
- `q`, `showDrafts`, ordering, cursor
- Completed + `closedRange`

### SSE

- Requires session auth
- Filters events by readable repo scope
- Emits upsert / remove / invalidate shapes
- Heartbeat keeps connection alive

### Frontend

- Mount: REST first, then EventSource
- Upsert: in-place patch + debounced open reload
- Invalidate / reconnect: full open reload
- Request epochs still drop stale responses

### Regression

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- Update dashboard facade and board client tests for DB-backed path

## Relationship to prior designs

- **Dashboard cold-start** reduced duplicate open scans and serial detail fetches but
  kept GitHub as the list source. This design removes GitHub from the list read path.
- **Dashboard board redesign** defined buckets and card shape; those product contracts
  remain.
- **Global PR search** reuses open pages API and therefore inherits index-backed speed.

## Implementation notes

- Prefer focused modules named for domain concepts (`pull-request-index-writer.ts`,
  `board-event-hub.ts`) — not generic `helpers` / `utils`.
- Follow backend layering: interfaces (controllers) → application (facades/use cases) →
  domain/infrastructure.
- All API responses keep the common envelope; SSE is a separate text/event-stream
  response, still session-guarded.
- Document non-obvious guards (stale webhook ordering, ready-only repos, 202
  best-effort side effects) with short “why” comments in code.

## Implementation status

**Plan:** [`docs/superpowers/plans/2026-07-12-dashboard-pr-index-sse.md`](../plans/2026-07-12-dashboard-pr-index-sse.md)

### Landed (2026-07-12, commit `9b9157e`)

| Spec area                                 | Landed as                                                            |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `pull_request_index` + repo backfill meta | Migration `0013_pull_request_index`, schema/repos under `@folio/db`  |
| Webhook-maintained index                  | `GitHubWebhookService` index actions + `PullRequestIndexWriter`      |
| Backfill on folio enable                  | Job kind `pr_index_backfill`, worker + `PullRequestIndexBackfill`    |
| DB-only board reads                       | `getDashboard*FromIndex` behind `DASHBOARD_READ_FROM_INDEX`          |
| Batch review status join                  | `resolveDashboardPullStatuses`                                       |
| SSE                                       | `GET /api/v1/dashboard/stream` + `BoardEventHub`                     |
| Client live updates                       | `connectDashboardBoardStream` (patch + ~400ms debounced open reload) |

### Config

| Variable                    | Default | Behavior                                                                                                                                                                                                              |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_READ_FROM_INDEX` | `false` | When `true`, open/completed dashboard pages read only `pull_request_index` (ready repos). When `false`, legacy live GitHub list path remains. Index **writes** (webhook/backfill) always run regardless of this flag. |

### Follow-up implementation (plan Tasks 9–12)

| Spec area                               | Gap                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Reconcile ~15 minutes                   | Landed in `833c8e5`; worker runs bounded sequential GitHub ↔ index rounds              |
| Bulk backfill for already-enabled repos | Landed in `c4771a5`; operations command exists but has not been run on production      |
| Production flag default `true`          | Ops cutover after ready coverage                                                       |
| Index-path facade regression tests      | Landed in `2268291`; flag-on path proves zero Octokit creation and ready-only reads    |
| Delete GitHub list cache from reads     | Only required after flag is permanently on; legacy path still uses it when flag is off |

### Cutover (summary)

1. Apply migration `0013`.
2. Run API + worker; bulk-enqueue `pr_index_backfill` for folio-enabled repos; wait until `pr_index_status = ready`.
3. Set `DASHBOARD_READ_FROM_INDEX=true` and restart API.
4. Smoke: fast board load, SSE update on PR open/edit, REST still works without SSE.
5. Rollback: set flag `false` and restart API (index continues to update in background).

### Related modules (code map)

```text
packages/db
  schema/pull-request-index.ts
  repos/pull-request-index.ts
  drizzle/0013_pull_request_index.sql

apps/backend
  application/dashboard/
    board-event-hub.ts
    pull-request-index-writer.ts
    pull-request-index-backfill.ts
    dashboard-index-pull-page.ts
    dashboard-index-pull-map.ts
    dashboard-review-status-batch.ts
  domain/github/github-webhook.service.ts
  interfaces/api/dashboard/dashboard.controller.ts  # GET stream
  worker.ts                                         # review_pull + pr_index_backfill

apps/web
  lib/dashboard-api.ts                              # BoardStreamEvent, stream URL
  components/dashboard/dashboard-board-stream.ts
  components/dashboard/dashboard-board-client.tsx
```
