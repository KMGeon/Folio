# Folio Admin Health Check Design

## Goal

Give the system admin a **read-only Ops failure signal** for:

1. Whether at least one **review worker process** is still alive (real heartbeat).
2. Whether the **Codex-backed review path** has evidence of recent success
   (last successful `review_pull`, not a live Codex exec probe).
3. Lightweight **queue context** reused from Phase 3 (pending / distressed).

This is a new Admin surface after Phases 1–3. It deliberately supplies the
**heartbeat source** that
[`2026-07-11-system-admin-console-design.md`](./2026-07-11-system-admin-console-design.md)
required before any worker online/offline claim.

## Confirmed Product Decisions

1. Primary purpose: **Ops 장애 감지** (not deploy smoke checklist alone).
2. Approach: **worker heartbeat table + Admin Health projection** (Approach 1).
3. Codex v1 depth: **heartbeat is for worker only**; Codex path uses
   **last successful `review_pull` + recent failure counts** — no live
   `codex exec` probe in v1.
4. Labels are factual: `ok` / `stale` / `unknown` (worker),
   `recent_success` / `aging` / `no_success` (Codex path). Do **not** say
   worker “healthy/unhealthy” or Codex “online/offline”.
5. system_admin only; metadata-only; no mutation, no secrets, no job payload/result.
6. Existing public `GET /health` remains **API liveness only** and is not the
   Admin worker/Codex signal.

## Non-Goals (v1)

- Live Codex authentication probe or billing-impacting model calls.
- Starting/stopping workers, reclaim, retry, or queue control.
- Multi-region fleet orchestration UI.
- Inferring worker liveness solely from job leases / `lockedBy`.
- Replacing EC2 smoke scripts end-to-end (they remain complementary).

## Problem With Inference-Only Signals

Phase 3 already exposes queue and distressed jobs. Those answer
“is work stuck?” They do **not** answer “is the worker process alive?”

- A healthy idle worker produces no job progress.
- A dead worker with empty queue looks the same as idle.
- A long `review_pull` holds a 10-minute lease without proving the process loop is alive.

Therefore Admin must not declare worker status without a dedicated heartbeat.

## Architecture

```text
worker loop
  ├─ every HEARTBEAT_MS (parallel timer): upsert worker_heartbeats
  └─ claim/process jobs (unchanged)

Admin API (system_admin)
  GET /api/v1/admin/health
       └─ AdminHealthFacade
            ├─ adminHealthRepo.listWorkers()
            ├─ adminJobsRepo (last review_pull success + failure counts)
            └─ queue distressed/pending counts (Phase 3)

Admin UI
  /admin/health  (+ sidebar entry)
  Overview attention when worker stale (and optional codex-path attention)
```

### Worker heartbeat write path

Constants (align with `apps/backend/src/worker.ts`):

| Constant | Value | Role |
| --- | --- | --- |
| `POLL_MS` | 2_000 | idle poll (existing) |
| `LEASE_MS` | 10 * 60_000 | job lease (existing) |
| `HEARTBEAT_MS` | 10_000 | heartbeat upsert interval (new) |
| `STALE_AFTER_MS` | 45_000 | Admin marks worker stale if `now - lastSeenAt` exceeds this |

Why a **parallel timer**: the main loop blocks on long jobs. Heartbeat must
continue while `processWorkerJob` runs; otherwise every long decomposition
would look “stale”.

On each tick the worker upserts by `workerId`:

- `workerId`: existing `worker-${pid}` (or future stable id)
- `lastSeenAt`: now
- `startedAt`: first insert only
- optional non-secret `pid` / process start label — **no host secrets, no env, no tokens**

On graceful shutdown (best-effort): leave the row; Admin uses staleness, not
delete-on-exit (crash must look stale, not missing forever without history).

### Persistence

New table `worker_heartbeats` (migration required):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | base columns |
| `created_at` / `updated_at` | timestamptz | base columns |
| `worker_id` | text unique not null | claim identity |
| `last_seen_at` | timestamptz not null | heartbeat time |
| `started_at` | timestamptz not null | first seen |

No FK to users. Rows are operational metadata.

Repository: `packages/db/src/repos/worker-heartbeats.ts`  
Admin read composition: `packages/db/src/repos/admin-health.ts` (or extend
admin-jobs for review_pull aggregates only — prefer `admin-health.ts` so
job projection stays separate).

## Wire Contracts (`@folio/types`)

```ts
// conceptual — strict Zod in packages/types/src/admin.ts (or admin-health.ts)

AdminWorkerHeartbeatStatus = "ok" | "stale" | "unknown"

AdminWorkerHeartbeatItem = {
  workerId: string
  lastSeenAt: IsoDateTime
  startedAt: IsoDateTime
  ageSeconds: number
  status: AdminWorkerHeartbeatStatus  // per-worker
}

AdminCodexPathStatus = "recent_success" | "aging" | "no_success"

AdminHealthPayload = {
  checkedAt: IsoDateTime
  worker: {
    status: AdminWorkerHeartbeatStatus  // fleet rollup
    staleAfterSeconds: number           // e.g. 45
    workers: AdminWorkerHeartbeatItem[]
  }
  codexPath: {
    // Facts about the review_pull pipeline, not a live Codex session probe.
    status: AdminCodexPathStatus
    lastReviewPullSucceededAt: IsoDateTime | null
    reviewPullSucceededLast24h: number
    reviewPullFailedLast24h: number     // failed + dead terminal counts for kind
    note: string                        // short fixed product copy, not free-form logs
  }
  queue: {
    pending: number
    distressedJobs: number
  }
}
```

### Status rules

**Per-worker**

- `ok`: `ageSeconds <= staleAfterSeconds`
- `stale`: `ageSeconds > staleAfterSeconds`
- (row always has lastSeenAt once written)

**Fleet rollup `worker.status`**

- `ok`: ≥1 worker with status `ok`
- `stale`: workers exist but none `ok`
- `unknown`: zero heartbeat rows ever (no worker has written)

**Codex path `codexPath.status`**

| Status | Rule |
| --- | --- |
| `recent_success` | last `review_pull` **succeeded** within 24h |
| `aging` | last success exists but older than 24h |
| `no_success` | no succeeded `review_pull` in DB |

`note` is a fixed, non-secret string, e.g.

- recent: `"Based on last succeeded review_pull job, not a live Codex probe."`
- aging/no_success: same disclaimer + that absence of success may mean low traffic.

Never claim “Codex auth valid” or “Codex online”.

## API

```text
GET /api/v1/admin/health
```

- Guards: `SessionAuthGuard` + `SystemAdminGuard`
- Common envelope
- No query mutation side effects
- Errors: `401` / `403` / `5xx` only (no 404 body — health always returns a payload)

Optional later: `POST` live probe — **out of v1**.

## Frontend

### Route

```text
/admin/health
```

Sidebar: ready **Health** item (e.g. Lucide `HeartPulse`), after Overview or
before Operations. Active path: exact `/admin/health`.

### Page content (dense, dark-only tokens)

1. **Worker** card: rollup badge (`ok`/`stale`/`unknown`), list of workers with
   `workerId`, last seen, age.
2. **Codex path** card: status, last success time, 24h succeeded/failed counts,
   fixed disclaimer.
3. **Queue** card: pending + distressed with links to
   `/admin/operations` and `/admin/operations?distressed=true`.

Empty/unknown states use muted copy (“아직 heartbeat가 없습니다”) — not green
false confidence.

### Overview integration

Attention items (count > 0 only):

| kind | When | Link |
| --- | --- | --- |
| `worker_stale` | fleet status is `stale` or `unknown` **and** we choose to alert | `/admin/health` |

Recommendation for v1 attention:

- Emit `worker_stale` when rollup is `stale` (workers existed but all timed out).
- Emit `worker_unknown` when rollup is `unknown` (no heartbeats) — **optional**;
  default **yes in prd**, careful in empty dev DBs. Prefer: always show on
  Health page; Overview attention only for `stale` to reduce dev noise.
  Document: Overview attention for `unknown` is **enabled** when
  `APP_PROFILE=prd`, suppressed when `dev` **or** always emit both and accept
  dev noise. **Decision: always emit `worker_stale` for stale; emit
  `worker_unknown` only in prd.**

Do **not** auto-attention on `codexPath.aging` alone (low traffic false
positives). Codex path is Health-page evidence only in v1.

## Security & Data Boundary

- system_admin only.
- No `payload`, `result`, `dedupeKey`, raw `lastError`, OAuth, Codex tokens,
  file paths to secrets, or env dumps in Admin responses.
- Heartbeat row contains only operational ids and timestamps.
- Admin must not call customer review APIs or synthesize membership.

## Backend Module Boundaries

| Unit | Responsibility |
| --- | --- |
| `worker_heartbeats` schema + migration | persistence |
| `worker-heartbeats` repo | upsert / list |
| worker loop timer | write heartbeat |
| `admin-health` repo | compose workers + job aggregates |
| `AdminHealthFacade` | status rules + DTO |
| `AdminHealthController` | HTTP |
| Overview facade | optional attention kinds |
| web `/admin/health` | UI |

## Testing Evidence

- Heartbeat upsert updates `last_seen_at` for same `worker_id`.
- Status rules: ok / stale / unknown unit tests with fixed `now`.
- Codex path status thresholds with fixture timestamps.
- Controller guards: Session + SystemAdmin.
- Allowlist: response keys ⊆ schema; no payload/secret fields.
- Overview attention rules (stale always; unknown prd-only).
- UI: empty workers, stale badge, disclaimer visible.
- Worker: timer fires independently of blocked job processing (unit/fake clock
  or extractable heartbeat scheduler test).

## Rollout

1. Migration + worker heartbeat write (safe if Admin UI not yet shipped).
2. Admin types + API + Health page.
3. Overview attention.
4. Deploy worker **before or with** API so production does not stay `unknown`
   after UI ships.

## Future Extensions (not v1)

- Live Codex visibility check (container file presence) behind explicit button.
- Live `codex` probe with cost/rate limits and redacted output.
- Multiple named worker pools / version channels.
- Heartbeat history sparkline / retention purge job.

## Completion Criteria

v1 is done when:

- Workers publish heartbeats on an interval that continues during long jobs.
- Admin Health shows worker rollup + codex path facts + queue context.
- No UI/API claims worker or Codex “healthy/online” without the definitions above.
- system_admin boundary and data allowlist hold under tests.
- lint / typecheck / non-DB tests pass under existing safety constraints.
