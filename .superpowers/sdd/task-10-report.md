# Task 10 Report: Admin Phase 1 Final Review Fixes

## Fixes

- Added `admin-server-access.ts` as the shared server boundary for validated Admin return paths, forwarded cookies, and Admin read error mapping.
- Updated Overview, Users, and Audit server pages so `ApiError` 401 redirects to login with the exact validated Admin pathname and search, 403 redirects to `/dashboard`, and every other failure reaches the Admin error boundary.
- Changed `getMe()` to return `null` only for 401. Valid backend error envelopes, malformed responses, and other non-401 failures now throw `AuthorizationApiError`.
- Replaced the Admin layout's duplicated cookie/path parsing with the shared access context while preserving unauthenticated and ordinary-user redirects.
- Added a labeled joined date/time to each Admin user row and explicit empty-result copy.
- Added direct unresolved-promise coverage proving an old in-flight Users page cannot overwrite an authoritative rerender.
- Removed the brittle source-text-only layout assertion after adding behavioral boundary coverage.

## TDD evidence

### RED

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin/admin-server-access.test.ts apps/web/src/app/admin/layout.test.tsx apps/web/src/lib/auth.test.ts apps/web/src/components/admin/admin-users-client.test.tsx`

- Failed because the shared server access module did not exist.
- Failed because a 503 `getMe()` response returned `null`.
- Failed because user rows had no joined time and an empty page rendered no explicit state.

### GREEN

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin/admin-server-access.test.ts apps/web/src/app/admin/layout.test.tsx apps/web/src/lib/auth.test.ts apps/web/src/components/admin/admin-users-client.test.tsx apps/web/src/app/admin/audit/page.test.tsx`

- Passed: 5 files, 40 tests.
- Covers exact unauthenticated return path, ordinary-user dashboard redirect, Admin read 401/403 mapping, 5xx rethrow, typed auth failures, joined/empty rendering, and stale unresolved pagination.

## Final verification

`SUPABASE_DATABASE_URL= pnpm exec vitest run apps/web/src/app/admin apps/web/src/components/admin apps/web/src/lib/admin-api.test.ts apps/web/src/lib/api-client.test.ts apps/web/src/lib/auth.test.ts`

- Passed: 12 files, 66 tests.

`SUPABASE_DATABASE_URL= pnpm --filter @folio/web typecheck`

- Passed with exit code 0.

## Files

- Added: `apps/web/src/app/admin/admin-server-access.ts`, its behavioral test, and `layout.test.tsx`.
- Updated: Admin layout/read pages and route tests, Admin Users component/tests, `auth.ts`/tests, and the existing Audit page test mock.

## Safety limitations

- No database access, environment-file reads, E2E, migrations, seeds, resets, clients, backend/frontend servers, browser runtime, or build command was used.
- Every test and typecheck command was prefixed with an empty `SUPABASE_DATABASE_URL`.
- Verification was intentionally limited to affected frontend unit tests, the full Admin frontend-focused suite, and web typecheck.
