# Folio Admin Phase 3: Operations Observability Design

## Goal

Deliver read-only job queue observability for the system admin console: paginated job
list, job detail, Overview distressed-job card/attention, and a queue snapshot panel.
No retry, cancel, pause, or worker control.

Builds on Phase 1–2 and freezes wire contracts for
[`2026-07-11-system-admin-console-design.md`](./2026-07-11-system-admin-console-design.md)
Operations section.

## Confirmed Decisions

1. Approach: dedicated `admin-jobs` projection (never return raw `Job` / `toJobWire`).
2. Distressed job: `status = dead` **or** (`status = failed` **and** `runAfter < now`).
3. List sort: `(createdAt desc, id desc)` with existing admin page cursor.
4. Filters: optional `status`, `kind`, `distressed` (`true` only when set).
5. Free-text `q`: optional, max 100; matches job UUID exactly when parseable as UUID.
   Repository name search is not required for MVP (avoids payload scans).
6. Safe repository identity only: `{ id, fullName } | null` resolved from payload keys
   via bounded lookups — never return `payload`, `result`, or `dedupeKey`.
7. Error surface: `errorSummary` only — length-capped and credential-scrubbed from
   `lastError`. Raw `lastError` stays internal.
8. No worker health labels (online/offline/healthy).
9. No schema migration.

## Routes

```text
/admin/operations
/admin/operations/jobs/[jobId]
```

Sidebar gains ready **Operations**. Active state covers list and nested job detail.

## API

```text
GET /api/v1/admin/jobs
GET /api/v1/admin/jobs/:jobId
```

Guards: `SessionAuthGuard` then `SystemAdminGuard`. Common envelope.

### List query

| Param | Rules |
| --- | --- |
| `limit` | 1–100, default 25 |
| `cursor` | opaque; malformed → 400 |
| `status` | optional job status enum |
| `kind` | optional job kind enum |
| `distressed` | optional; only `true` filters to distressed set |
| `q` | optional trim max 100; exact job UUID when valid |

### Errors

Same as Phase 1/2: `400` invalid query/cursor, `401`/`403` auth, `404` missing job, `5xx` infra.

## Wire Contracts

### `AdminJobItem` (strict allowlist)

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `kind` | job kind |
| `status` | job status |
| `attempts`, `maxAttempts` | ints |
| `runAfter` | ISO |
| `leaseExpiresAt` | ISO \| null |
| `lockedBy` | opaque worker id string \| null |
| `repository` | `{ id: uuid, fullName: string } \| null` |
| `errorSummary` | scrubbed string \| null |
| `isDistressed` | boolean at projection time |
| `createdAt`, `updatedAt` | ISO |

### `AdminJobPage`

`{ items, nextCursor }`

### `AdminJobDetail`

Same fields as `AdminJobItem` (no extra secrets).

### Overview extension

```ts
metrics: {
  pendingUsers, workspaces, enabledRepositories,
  distressedJobs: number
}
attention: [
  ...phase1_2,
  { kind: "distressed_jobs", count } // only when > 0
]
queueSnapshot: {
  pending: number;           // status=pending
  running: number;           // claimed + running
  retrying: number;          // failed && runAfter > now
  succeededLast24h: number;  // succeeded && updatedAt >= now-24h
  deadLast24h: number;       // dead && updatedAt >= now-24h
}
recentAudit: unchanged
```

Attention link: `/admin/operations?distressed=true`

## Safe repository resolution

Never return payload. Extract only identity keys:

| Kind | Source |
| --- | --- |
| `review_pull` | `owner`/`repo` → `fullName`; `id` null unless later linked |
| `pr_index_backfill` | `repositoryId` → repositories row |
| `decompose` / `re_chapter` / `sync_comments` | `prId` → pull_requests → repositories |

Batch lookups only for IDs present on the current page/detail row.

## Error summary

- Max length 200 characters (Unicode-safe slice + ellipsis).
- Redact common secret patterns (GitHub tokens, Bearer tokens).
- Empty/null input → null.

## Backend modules

| Unit | Role |
| --- | --- |
| `packages/db/src/repos/admin-jobs.ts` | list/detail/counts/distressed filter |
| `admin-job-error-summary.ts` | pure scrubber |
| `AdminJobsFacade` | DTO projection + cursor |
| `AdminJobsController` | HTTP |
| Overview facade | distressed metric, attention, queueSnapshot |

## Frontend

| Piece | Behavior |
| --- | --- |
| Sidebar | Operations ready route |
| `/admin/operations` | status/kind/distressed filters + cursor list |
| Detail | read-only job metadata; no action buttons |
| Overview | 4 metric cards; distressed attention; queue snapshot panel |
| Labels | pending/claimed/running/failed/dead/retry facts only — never worker health |

## Testing evidence

- Distressed definition unit tests
- List filters + stable/malformed cursor
- Allowlist: no `payload`/`result`/`dedupeKey`/`lastError` keys
- Lease/retry labels without health inference
- Overview distressed + queue snapshot
- Sidebar + empty/loading/error UI patterns
- No mutation endpoints
- Phase 1–2 regression

## Non-goals

- Retry, cancel, pause, enqueue, worker start/stop
- Webhook delivery history
- Raw payload/result inspection
- Inferring worker online/offline state

## Safety constraints for implementers

Same as Phase 2: no `.env*`, no servers, no DB E2E, `SUPABASE_DATABASE_URL=` empty for
lint/typecheck/test; build/browser require user approval.
