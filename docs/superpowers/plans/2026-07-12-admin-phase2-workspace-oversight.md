# Admin Phase 2 Workspace Oversight — Implementation Plan

> **For agentic workers:** implement end-to-end with TDD. Spec:
> `docs/superpowers/specs/2026-07-12-admin-phase2-workspace-oversight-design.md`
> Parent console design:
> `docs/superpowers/specs/2026-07-11-system-admin-console-design.md`

**Branch:** `KMGeon/fork`  
**Base:** includes design commit for Phase 2 (after `22df02f` Phase 1)

## Safety (mandatory)

- Never read/use `.env`, `.env.dev`, `.env.prd` or connect real/prod DB.
- Do not start servers.
- Do not run DB E2E / concurrency E2E.
- Safe commands only, with empty DB URL:

```bash
SUPABASE_DATABASE_URL= pnpm lint
SUPABASE_DATABASE_URL= pnpm typecheck
SUPABASE_DATABASE_URL= pnpm test
```

- Do not run `pnpm build` or browser verification without user approval; report as unverified.

## Task Order

### T1 — Types (`packages/types/src/admin.ts`)

- Add installation state enum, workspace item/page/detail schemas.
- Extend overview metrics + attention union for Phase 2.
- Export from package index if needed.
- Unit tests for schema allowlist / parse success+failure.

### T2 — DB repo (`packages/db/src/repos/admin-workspaces.ts`)

- List with search, optional installationState filter, stable cursor.
- Batch aggregates scoped to page workspace IDs.
- Detail loaders always workspace-scoped.
- Counts for overview: total workspaces, enabled repos, suspended installations.
- Export from `repos/index.ts`.
- Unit tests with mocked db or pure projection helpers as patterns allow.

### T3 — Backend facade + controller

- `AdminWorkspacesFacade` + tests.
- `AdminWorkspacesController` + guard/query/404 tests.
- Extend `admin-query.ts`, `authorization.module.ts`, overview facade + tests.

### T4 — Frontend API + shell + pages

- `admin-api.ts` fetch helpers.
- Sidebar Workspaces ready route + active state tests.
- `/admin/workspaces` list + client (empty/loading/error/next-page).
- `/admin/workspaces/[workspaceId]` detail.
- Overview cards + suspended attention link/empty.

### T5 — Evidence pass

- Cross-workspace mixing tests.
- Allowlist non-disclosure tests.
- Phase 1 regression (users/audit/overview still pass).
- Atomic commits by layer.
- Final report: verified vs skipped.

## Suggested Commits

1. `feat(types): admin workspace wire contracts`
2. `feat(db): admin workspace projections`
3. `feat(backend): admin workspace list/detail APIs`
4. `feat(web): admin workspace list/detail UI + overview`
5. `test(admin): phase 2 evidence + phase 1 regression`

## Done When

All Phase 2 design completion criteria met and non-DB verification report written.
