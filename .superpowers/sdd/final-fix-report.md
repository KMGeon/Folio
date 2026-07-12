# Final onboarding guard fix report

## Scope

- Made the installation onboarding overlay a keyboard modal: initial focus enters
  the dialog, Tab and Shift+Tab remain within its controls, and teardown returns
  focus to the element that opened it.
- Restored the approved Korean reconnect and suspended-access messages.
- Made `WorkspaceClaimFacade.currentContext` fail closed to `install_required`
  when a workspace lookup has no matching membership, even if an active
  installation is present.

## TDD evidence

The new focused tests were run against `b0f11bc` before production changes and
failed for the missing copy, focus lifecycle, and stale-membership cases. After
the minimal implementation, the focused run passed: 27 tests across the web
gate and workspace-claim facade suites.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 1,037 passed; 66 database-dependent tests skipped
- `pnpm build`
