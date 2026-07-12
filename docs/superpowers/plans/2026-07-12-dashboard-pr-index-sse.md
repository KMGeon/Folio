# Dashboard PR Index + SSE Implementation Plan

> **For agentic workers:** Implementation is in progress on this branch. Spec:
> `docs/superpowers/specs/2026-07-12-dashboard-pr-index-sse-design.md`

**Goal:** Fast first load + near real-time open PR board via DB projection + SSE.

**Architecture:** Webhook/backfill write `pull_request_index`; dashboard reads index
when `DASHBOARD_READ_FROM_INDEX=true`; SSE pushes light board events.

**Tech Stack:** NestJS, Postgres/Drizzle, Next.js EventSource, existing job queue.

## Global Constraints

- Zero GitHub calls on index read path
- Webhook side effects stay 202 best-effort
- Bucket semantics unchanged
- `pull_request_index` separate from review `pull_requests`

## Status

| Phase | Status |
|-------|--------|
| P0 Schema + migration | Done |
| P1 Writer + webhook | Done |
| P2 Backfill job | Done |
| P3 Index read path + flag | Done (flag default false) |
| P4 Batch status join | Done (basic batch) |
| P5 SSE stream | Done |
| P6 Frontend EventSource | Done |
| P7 Reconcile cron | Deferred (webhook + backfill only) |
| P8 Cutover flag true | Ops: after backfill all enabled repos |

## Cutover

1. Deploy with `DASHBOARD_READ_FROM_INDEX=false` (default)
2. Enable folio repos → backfill jobs run
3. Confirm `pr_index_status=ready` for active repos
4. Set `DASHBOARD_READ_FROM_INDEX=true`
5. Restart API
