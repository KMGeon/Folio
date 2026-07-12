# Admin Phase 3 Operations — Implementation Plan

> Spec: `docs/superpowers/specs/2026-07-12-admin-phase3-operations-design.md`

**Branch base:** Phase 2 workspace oversight branch / PR #106 stack.

## Safety

```bash
SUPABASE_DATABASE_URL= pnpm lint
SUPABASE_DATABASE_URL= pnpm typecheck
SUPABASE_DATABASE_URL= pnpm test
```

No servers, no `.env*`, no DB E2E, no build without approval.

## Tasks

1. Types — job item/page/detail, overview metrics/attention/queueSnapshot
2. DB — `admin-job-error-summary`, `admin-jobs` list/detail/counts
3. Backend — facade, controller, query parse, overview wiring
4. Web — API client, operations list/detail, sidebar, overview cards+snapshot
5. Evidence — allowlist tests, distressed definition, Phase 1–2 green

## Commits

1. docs
2. types
3. db
4. backend
5. web
