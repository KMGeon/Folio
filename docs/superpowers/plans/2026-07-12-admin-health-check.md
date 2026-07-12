# Admin Health Check Implementation Plan

> Spec: `docs/superpowers/specs/2026-07-12-admin-health-check-design.md`

**Goal:** system_admin read-only Health page with worker heartbeats + Codex path evidence + queue context.

**Architecture:** parallel worker heartbeat upsert → `worker_heartbeats` table → `GET /api/v1/admin/health` + `/admin/health` UI; Overview attention for stale workers.

**Safety:** `SUPABASE_DATABASE_URL=` empty for lint/typecheck/test; no servers; no live Codex probe.

## Tasks

1. Types — AdminHealthPayload + overview attention kinds
2. Schema + migration `0014_worker_heartbeats`
3. `worker-heartbeats` repo + pure status rules tests
4. `admin-health` repo (list workers, review_pull aggregates)
5. Worker parallel heartbeat timer
6. AdminHealthFacade/Controller + Overview wiring
7. Web Health page, sidebar, overview attention, API client
8. Verify + PR
