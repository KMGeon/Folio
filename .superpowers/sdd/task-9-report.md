# Task 9 Report: Admin Audit, Overview, and Settings Separation

## Scope delivered

- Added Phase 1 `/admin/audit` and `/admin/overview` pages and focused components.
- Added GET audit filters, safe text-only JSON snapshots, retained-row retry pagination, and ID de-duplication.
- Added the pending-user overview metric/attention link and at most five recent audit rows.
- Removed global system-user administration from customer Workspace settings.
- Removed obsolete global/pending-user compatibility APIs from `auth.ts`; admin lifecycle operations remain in `admin-api.ts`.
- Added no Workspace oversight, jobs, or operations placeholders.

## TDD evidence

### RED

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/components/admin/admin-audit-client.test.tsx apps/web/src/components/admin/admin-overview.test.tsx`

- Failed: 2 suites, because `admin-audit-client` and `admin-overview` did not exist.

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/settings/settings-routes.test.ts`

- Failed: 1 assertion because Workspace settings still contained `listGlobalUsers`.

### GREEN

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/components/admin/admin-audit-client.test.tsx apps/web/src/components/admin/admin-overview.test.tsx`

- Passed: 2 files, 7 tests.

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/components/admin/admin-audit-client.test.tsx apps/web/src/components/admin/admin-overview.test.tsx apps/web/src/app/settings/settings-routes.test.ts apps/web/src/lib/auth.test.ts`

- Passed: 4 files, 24 tests.

## Safe focused verification

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin apps/web/src/components/admin apps/web/src/lib/admin-api.test.ts apps/web/src/lib/auth.test.ts apps/web/src/app/settings/settings-routes.test.ts apps/web/src/components/global-navigation-rail.test.tsx && SUPABASE_DATABASE_URL= pnpm --filter @folio/web typecheck`

- Passed: 10 test files, 58 tests; web TypeScript check exited 0.
- No database, E2E, migration, seed, reset, server, or browser-runtime command was run.

## Self-review

- Audit snapshot values are rendered only through `JSON.stringify(value, null, 2)` as React text in scrollable `<pre>` elements; no HTML injection API is used.
- Pagination failures preserve the current rows and cursor; retry uses the same cursor, and overlapping IDs are filtered.
- Workspace settings retain only customer Workspace responsibilities.

## Date-filter contract follow-up

### RED

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin/audit/page.test.tsx`

- Failed: 3 of 5 tests. Valid `YYYY-MM-DD` values reached `fetchAdminAudit` without offset-aware timestamps, and invalid calendar/datetime values were forwarded.

### GREEN

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin/audit/page.test.tsx`

- Passed: 1 file, 5 tests. Valid date-only values remain in the form props while API `from` and `to` use UTC day boundaries; absent and invalid dates are omitted.

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin/audit/page.test.tsx apps/web/src/components/admin/admin-audit-client.test.tsx apps/web/src/lib/admin-api.test.ts && SUPABASE_DATABASE_URL= pnpm --filter @folio/web typecheck`

- Passed: 3 test files, 16 tests; web TypeScript check exited 0.
- No database, E2E, server, browser-runtime, or environment-file command was run.

## Date-filter pagination follow-up

### RED

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/components/admin/admin-audit-client.test.tsx`

- Failed: 1 of 5 tests. The pagination request sent form-facing `2026-07-01` and `2026-07-12` values instead of the validated ISO request boundaries.

### GREEN

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin/audit/page.test.tsx apps/web/src/components/admin/admin-audit-client.test.tsx apps/web/src/lib/admin-api.test.ts && SUPABASE_DATABASE_URL= pnpm --filter @folio/web typecheck`

- Passed: 3 test files, 17 tests; web TypeScript check exited 0.
- The server fetch, load-more, and retry paths share the validated request filters; visible date controls remain date-only, and retry still retains and de-duplicates rows.
- No database, E2E, server, browser-runtime, or environment-file command was run.
