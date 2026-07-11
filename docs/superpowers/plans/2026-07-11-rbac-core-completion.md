# RBAC Core Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Folio's RBAC Tasks 18–24, connect the real development Supabase database, and prove the authenticated workspace/repository/review flow end to end.

**Architecture:** Preserve the existing GitHub permission ∧ workspace role ∧ entitlement model. Complete claim/current-context with a server-verified installation identity and a short-lived claim proof, retrofit repository, dashboard, and pull APIs to stable workspace IDs, then add role-aware settings UI and verify it against the real development database.

**Tech Stack:** pnpm 10, TypeScript ESM, NestJS, Next.js App Router, Drizzle/Postgres (Supabase), Zod, Vitest, Orca orchestration/browser, 1Password CLI.

## Global Constraints

- Work from `docs/superpowers/specs/2026-07-11-rbac-core-completion-design.md` and the original RBAC design/plan.
- Preserve all existing user changes; the Task 18 RED work already present in the active worktree is the baseline, not disposable scratch work.
- Backend layers remain `interfaces` → `application` → `domain` → `infrastructure`; every API response uses the common envelope.
- GitHub account IDs, logins, roles, and installation IDs from an ordinary client body are never trusted without server verification.
- `system_admin` never bypasses workspace membership or GitHub permission for customer repository data.
- Explicit owner claim is audited; ordinary reviewer auto-join is not audited.
- Shared types remain real `.ts` modules in `@folio/types`; no new ambient `.d.ts` files.
- UI is dark-only and uses existing OKLCH tokens and shadcn primitives; do not invent colors, font sizes, or shadow tiers.
- Do not add a `max-lines` disable, bypass hooks, or use vague new module names such as `helpers` or `utils`.
- Real secrets are written only to ignored local `.env`; never print, commit, patch, or return secret values.
- Development DB migrations and external writes require a decision gate immediately before execution. Production DB and deployment remain unauthorized.
- Each implementation slice uses RED → GREEN → regression verification, then spec review and code-quality review.

## File Responsibility Map

- `packages/github/src/install.ts`: server-side GitHub App installation account lookup.
- `apps/backend/src/domain/auth/installation-claim-token.ts`: short-lived signed proof binding an installation callback to the authenticated user.
- `apps/backend/src/application/authorization/workspace-claim.facade.ts`: atomic owner claim, reviewer join, audit, and current context.
- `apps/backend/src/interfaces/api/workspaces/workspace.controller.ts`: session-protected `/current` and proof-protected `/claim` routes.
- `apps/backend/src/infrastructure/authorization/workspace-resolver.ts`: stable workspace resolution by ID, repo, account, and user membership.
- `apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts`: resolve workspace scope from workspace, repository route, or verified request body.
- `apps/backend/src/application/repositories/repositories.facade.ts`: workspace-scoped listing and audited activation.
- `apps/backend/src/application/dashboard/*`: dashboard reads restricted to repositories belonging to the user's current workspace.
- `apps/backend/src/interfaces/api/pulls/pulls.controller.ts`: action-specific role, GitHub level, and entitlement enforcement.
- `apps/web/src/lib/auth.ts`: typed member and global-user mutations.
- `apps/web/src/lib/workspace-permission.ts`: current-context loading and pure permission predicates.
- `apps/web/src/components/settings/workspace-members-admin.tsx`: member administration UI only.
- `apps/web/src/components/settings/system-users-admin.tsx`: global-user administration UI only.
- `apps/web/src/app/settings/workspaces/page.tsx`: server-side permission bootstrap and section composition.
- `apps/web/src/components/repository-toggle-form.tsx`: permission-aware repository activation affordance.
- `apps/web/src/app/settings/repositories/page.tsx`: context-aware repository settings composition.

---

### Task 0: Reconcile And Finish The In-Flight Claim Slice

```yaml
dag:
  id: claim-core
  purpose: Finish the existing Task 18 RED work and ship a secure, atomic workspace claim/current-context flow.
  deps: []
  parallel_group: wave-0
  worktree_strategy: intra-worktree
  worker_role: implementer
  scope:
    files:
      - packages/types/src/authorization.ts
      - packages/db/src/repos/workspace-members.ts
      - packages/db/src/repos/workspaces.ts
      - packages/db/src/schema/audit-logs.ts
      - packages/github/src/install.ts
      - apps/backend/src/domain/auth/installation-claim-token.ts
      - apps/backend/src/infrastructure/github/github-oauth.adapter.ts
      - apps/backend/src/application/auth/auth.controller.ts
      - apps/backend/src/application/authorization/workspace-claim.facade.ts
      - apps/backend/src/interfaces/api/workspaces/workspace.controller.ts
      - apps/backend/src/application/authorization/authorization.module.ts
      - apps/web/src/app/onboarding/install/page.tsx
      - apps/web/src/components/claim-workspace-button.tsx
    modules: [types, db, github, backend-auth, backend-authorization, web-onboarding]
  verification:
    commands:
      - pnpm --filter @folio/types typecheck
      - pnpm --filter @folio/backend test workspace-claim workspace-controller authorization.module workspace-membership workspace-resolver
      - pnpm --filter @folio/github test install
    expected: All selected suites pass; the DB concurrency suite may only run after the DB gate.
  risk:
    collision: high
    external_write: false
    database: false
    deployment: false
    notes: A pre-existing Claude terminal is editing these files; wait for its handoff/idle state and reconcile its diff before any new edit.
  handoff_payload:
    include_spec_sections: [Workspace Installation And Claim Flow, Current Workspace Context, Error Handling]
    include_plan_sections: [Task 0]
```

**Interfaces:**

- Produces `getInstallationAccount(installationId: number): Promise<InstallationAccountIdentity>` in `@folio/github`, where `InstallationAccountIdentity` is `{ githubAccountId: number; accountLogin: string; accountType: AccountType }`.
- Produces `createInstallationClaimToken(input, secret)` and `verifyInstallationClaimToken(token, secret)` with payload `{ userId: string; installationId: number; expiresAt: number }`.
- Produces `WorkspaceClaimFacade.claimAsOwner(input: ClaimInput): Promise<WorkspaceMemberRow>` and `currentContext(userId: string): Promise<WorkspaceContext>`.
- Produces `POST /api/v1/workspaces/claim` body `{ installationId: number }`, accepted only with a valid HttpOnly claim cookie bound to the same session user and installation ID.

- [ ] **Step 1: Stop file collisions and capture the current handoff**

Use Orca to wait for the existing `Claude RBAC handoff` terminal to become idle, read its retained transcript, and record the exact uncommitted paths. Do not dispatch a second writer into the active worktree.

Run first: `orca terminal list --worktree active --json`. Reacquire the terminal whose Orca tab is named `Claude RBAC handoff`, then run `orca terminal wait --terminal term_c9448124-2e4f-47f8-bd76-35feae7e7e84 --for tui-idle --timeout-ms 3600000 --json`. If Orca reports a stale handle, substitute the freshly listed handle before waiting.

Expected: idle terminal or structured worker completion. If it is still editing after the timeout, open a decision gate rather than editing the same files.

- [ ] **Step 2: Confirm the inherited RED/GREEN boundary**

Run:

```bash
pnpm --filter @folio/types typecheck
pnpm --filter @folio/backend test workspace-membership.service workspace-resolver workspace-claim workspace.controller authorization.module
```

Expected: already implemented transaction/list-order tests pass; missing `workspace-claim.facade.ts` and `workspace.controller.ts` tests fail until their production files exist.

- [ ] **Step 3: Add server-side installation account lookup**

Add a failing `packages/github/src/__tests__/install.test.ts` case that stubs `createAppOctokit().rest.apps.getInstallation` and expects normalized identity:

```ts
await expect(getInstallationAccount(123)).resolves.toEqual({
  githubAccountId: 42,
  accountLogin: "acme",
  accountType: ACCOUNT_TYPE.ORGANIZATION,
});
```

Implement in `packages/github/src/install.ts`:

```ts
export async function getInstallationAccount(
  installationId: number,
): Promise<InstallationAccountIdentity> {
  const { data } = await createAppOctokit().rest.apps.getInstallation({ installation_id: installationId });
  const account = data.account;
  if (!account || !("login" in account) || typeof account.id !== "number") {
    throw new Error("GitHub installation account identity is unavailable");
  }
  return {
    githubAccountId: account.id,
    accountLogin: account.login,
    accountType: account.type === "Organization" ? ACCOUNT_TYPE.ORGANIZATION : ACCOUNT_TYPE.USER,
  };
}
```

Export the function and type from `packages/github/src/index.ts`.

- [ ] **Step 4: Bind installation callback to user and expiry**

Create `apps/backend/src/domain/auth/installation-claim-token.test.ts` with cases for valid token, wrong user/installation, tampering, and expiry. Implement an HMAC-SHA256 token in `installation-claim-token.ts` using timing-safe signature comparison. The verified payload schema must require integer `installationId`, non-empty `userId`, and future `expiresAt`.

The public signatures are:

```ts
export function createInstallationClaimToken(
  input: { userId: string; installationId: number; expiresAt: number },
  secret: string,
): string;

export function verifyInstallationClaimToken(
  token: string,
  secret: string,
): { userId: string; installationId: number; expiresAt: number } | null;
```

Use `GITHUB_APP_WEBHOOK_SECRET` as the existing server-only signing secret and document why this does not expose or weaken webhook verification.

- [ ] **Step 5: Preserve the authenticated user ID through installation callback**

Extend approved `LoginCompletion` to include `userId`:

```ts
type LoginCompletion =
  | { status: "approved"; userId: string; token: string; expiresAt: Date }
  | { status: "pending" };
```

When GitHub supplies `installation_id`, `AuthController.callback` must parse it as a positive integer, complete login, set the session cookie, set a ten-minute HttpOnly `folio_installation_claim` cookie containing the signed token, and redirect to `/onboarding/install?installation_id=${installationId}`. Invalid IDs fail closed with `BadRequestException`.

- [ ] **Step 6: Finish atomic claim and current context**

Implement `WorkspaceClaimFacade` against the existing RED tests. Within one Drizzle transaction:

```ts
const upserted = await workspacesRepo.upsertByGithubAccountId(account, tx);
const workspace = await workspacesRepo.getByGithubAccountIdForUpdate(
  upserted.githubAccountId,
  tx,
);
```

Then preserve suspended membership, return existing membership when an owner exists, create an unaudited reviewer when needed, or create/promote the first owner and record exactly one `AUDIT_ACTION.WORKSPACE_CLAIM` row in the same transaction. A failed compare-and-set promotion throws `ErrorType.WorkspaceMembershipConflict` without audit.

`currentContext` loads the user, deterministic first workspace, membership, and every entitlement decision, returning the exact `WorkspaceContext` contract in the design.

- [ ] **Step 7: Implement proof-protected routes**

`WorkspaceController.claim` must:

1. Parse body with `z.object({ installationId: z.number().int().positive() })`.
2. Read and verify `folio_installation_claim`.
3. Require payload user ID and installation ID to match the session/body.
4. Resolve account identity through `GitHubOAuthAdapter.getInstallationAccount`.
5. Call `claimAsOwner` with server-resolved account fields.
6. Clear the proof cookie after success.

No valid proof maps to `ErrorType.WorkspaceNotFound`; no body account/login/role fields are accepted.

- [ ] **Step 8: Complete onboarding claim UI**

Create `ClaimWorkspaceButton` as a client component. It posts only `{ installationId }` through `apiRequest`, reports a Korean error, and sends the user to `/settings/workspaces` on success. Render it only for a positive `installation_id` query value; otherwise render the existing GitHub installation link using the configured app slug route.

- [ ] **Step 9: Run focused tests and commit the reconciled slice**

Run:

```bash
pnpm --filter @folio/github test install
pnpm --filter @folio/types typecheck
pnpm --filter @folio/backend test workspace-claim installation-claim-token workspace.controller authorization.module workspace-membership workspace-resolver auth.controller
pnpm --filter @folio/web test onboarding workspace-permission
```

Expected: all selected non-DB tests pass.

Commit only the Task 0 paths with: `feat(auth): complete secure workspace claim flow`.

---

### Task 1: Claim Slice Specification Review

```yaml
dag:
  id: claim-spec-review
  purpose: Verify claim-core exactly satisfies the approved claim, trust, audit, and context contracts.
  deps: [claim-core]
  parallel_group: wave-0-review-a
  worktree_strategy: intra-worktree
  worker_role: spec-reviewer
  scope:
    files:
      - packages/types/src/authorization.ts
      - packages/db/src/repos/workspace-members.ts
      - packages/db/src/repos/workspaces.ts
      - packages/db/src/schema/audit-logs.ts
      - packages/github/src/install.ts
      - apps/backend/src/domain/auth/installation-claim-token.ts
      - apps/backend/src/application/authorization/workspace-claim.facade.ts
      - apps/backend/src/interfaces/api/workspaces/workspace.controller.ts
      - apps/web/src/components/claim-workspace-button.tsx
      - docs/superpowers/specs/2026-07-11-rbac-core-completion-design.md
    modules: [claim-flow]
  verification:
    commands: [git show --stat --oneline HEAD, git diff HEAD^..HEAD]
    expected: No client-trusted identity, no suspended-member recreation, one atomic audited owner claim, complete current context.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Read-only review; report exact file and line for every gap.
  handoff_payload:
    include_spec_sections: [Workspace Installation And Claim Flow, Current Workspace Context]
    include_plan_sections: [Task 0]
```

- [ ] Compare each Task 0 requirement to the diff and tests.
- [ ] Confirm the claim proof is user-bound, installation-bound, expiring, tamper-evident, HttpOnly, and cleared after use.
- [ ] Confirm audit and membership mutations share the same transaction.
- [ ] Return `PASS` or a concrete gap list; do not edit files.

---

### Task 2: Claim Slice Code-Quality Review

```yaml
dag:
  id: claim-quality-review
  purpose: Review claim-core for concurrency safety, module boundaries, maintainability, and test quality.
  deps: [claim-spec-review]
  parallel_group: wave-0-review-b
  worktree_strategy: intra-worktree
  worker_role: quality-reviewer
  scope:
    files:
      - packages/github/src/install.ts
      - apps/backend/src/domain/auth/installation-claim-token.ts
      - apps/backend/src/application/auth/auth.controller.ts
      - apps/backend/src/application/authorization/workspace-claim.facade.ts
      - apps/backend/src/interfaces/api/workspaces/workspace.controller.ts
    modules: [claim-flow]
  verification:
    commands: [pnpm --filter @folio/backend test workspace-claim installation-claim-token]
    expected: Tests pass and review finds no blocking quality issue.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Fail on swallowed errors, non-atomic writes, unsafe token parsing, or vague modules.
  handoff_payload:
    include_spec_sections: [Error Handling, Testing And Review]
    include_plan_sections: [Task 0]
```

- [ ] Inspect failure paths, timing-safe verification, transaction propagation, and Nest module wiring.
- [ ] Run the focused tests fresh.
- [ ] Return `PASS` or concrete findings. Findings create a fix task followed by both reviews again.

---

### Task 3: Retrofit Backend APIs To All Three Axes

```yaml
dag:
  id: backend-retrofit
  purpose: Enforce stable workspace scope, action-specific GitHub levels, and entitlement on repositories, dashboard, and pull APIs.
  deps: [claim-quality-review]
  parallel_group: wave-1
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - packages/db/src/repos/repositories.ts
      - packages/db/test/repos.e2e.test.ts
      - apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts
      - apps/backend/src/application/repositories/repositories.facade.ts
      - apps/backend/src/interfaces/api/repositories/repositories.controller.ts
      - apps/backend/src/application/repositories/repositories.module.ts
      - apps/backend/src/application/dashboard/dashboard.facade.ts
      - apps/backend/src/interfaces/api/dashboard/dashboard.controller.ts
      - apps/backend/src/application/dashboard/dashboard.module.ts
      - apps/backend/src/interfaces/api/pulls/pulls.controller.ts
      - apps/backend/src/application/review/review.module.ts
    modules: [db, backend-repositories, backend-dashboard, backend-review, backend-authorization]
  verification:
    commands:
      - pnpm --filter @folio/backend test repositories workspace-role.guard dashboard pulls.controller
      - pnpm --filter @folio/backend typecheck
    expected: All selected tests and backend typecheck pass.
  risk:
    collision: low
    external_write: false
    database: false
    deployment: false
    notes: Dashboard helper modules also query by login; search all calls and convert the full path, not only DashboardFacade.getForUser.
  handoff_payload:
    include_spec_sections: [Authorization Architecture, Existing Endpoint Retrofit, Error Handling]
    include_plan_sections: [Task 3]
```

**Interfaces:**

- Add `repositoriesRepo.listByWorkspaceId(workspaceId, db?)` and `getByIdForUpdate(id, db?)`.
- Change repository facade inputs to `{ userId: string; login: string }`.
- `RepositoriesFacade.setEnabled` resolves the repository's workspace, checks active admin+ membership, checks live GitHub `admin`, checks entitlement at the controller, then atomically updates and audits.
- Dashboard methods continue accepting `{ id, login }` externally but resolve the workspace from `id` and enumerate only repositories/installations in that workspace.

- [ ] **Step 1: Write repository isolation and audit RED tests**

Replace login-inference fixtures with a mocked `WorkspaceResolver.firstWorkspaceForUser`. Assert:

```ts
await facade.listForUser({ userId: "u1", login: "alice" });
expect(repositoriesRepo.listByWorkspaceId).toHaveBeenCalledWith("ws1");
```

Add cases for no membership, repository from another workspace, reviewer activation denial, GitHub level below admin, unchanged state without duplicate audit, and audit failure rollback.

- [ ] **Step 2: Add workspace repository queries**

Implement:

```ts
async listByWorkspaceId(workspaceId: string, db: Db = getDb()) {
  return db.select().from(repositories).where(eq(repositories.workspaceId, workspaceId));
}

async getByIdForUpdate(id: string, db: Db = getDb()) {
  const [row] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1).for("update");
  return row ?? null;
}
```

Add DB E2E assertions that another workspace's rows are excluded. The E2E suite runs after the DB gate.

- [ ] **Step 3: Extend workspace role resolution without trusting arbitrary scope**

Update `WorkspaceRoleGuard` so scope resolution order is:

1. `params.workspaceId` → `resolveById`.
2. `params.owner` + `params.repo` → `resolveByRepo`.
3. A controller-attached, server-verified `request.workspace`.

Do not read a raw `workspaceId` from request body. Add unit tests for all three paths and fail-closed behavior.

- [ ] **Step 4: Implement audited repository activation**

In one transaction, load and lock the repository, require its `workspaceId` to equal the caller's resolved workspace, load membership and user, apply `canAccessWorkspace(..., WORKSPACE_ROLE.ADMIN)`, require `RepoAccessService.assertLevelAtLeast(..., "admin")`, update only on a real change, and write:

```ts
{
  action: AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
  actorUserId: input.userId,
  targetType: "repository",
  targetId: repo.id,
  workspaceId: workspace.id,
  before: { folioEnabled: repo.folioEnabled },
  after: { folioEnabled: input.enabled },
}
```

Use `CoreException` error types rather than Nest exceptions inside the application layer.

- [ ] **Step 5: Retrofit repository controller**

Pass both user ID and login. Apply `EntitlementGuard` plus `@RequireEntitlement(ENTITLEMENT_FEATURE.REPO_ACTIVATION)` to activation. Keep list session-protected and workspace-scoped.

- [ ] **Step 6: Retrofit dashboard reads**

Add `@RequireEntitlement(ENTITLEMENT_FEATURE.REVIEW_READ)` and `EntitlementGuard` at controller level. Resolve current workspace from `user.id`; if absent, return an empty dashboard payload rather than leaking login-matched installations. Update dashboard summary/page helpers to accept workspace-scoped repositories/installations instead of calling `listByAccountLogin`.

Add tests showing an installation with the same mutable login but another workspace never appears.

- [ ] **Step 7: Retrofit pull actions**

Apply role and entitlement metadata:

```ts
@UseGuards(RepoAccessGuard, WorkspaceRoleGuard, EntitlementGuard)
@RequireWorkspaceRole(WORKSPACE_ROLE.REVIEWER)
@RequireEntitlement(ENTITLEMENT_FEATURE.REVIEW_READ)
```

Use `REVIEW_STATE_MUTATION` for viewed endpoints and `COMMENT` for comment creation. Extend `RepoAccessGuard` with required-level metadata or add `@RequireRepoLevel("write")` so comment routes require write while reads/state require read.

For body-scoped manual analysis, resolve the repository server-side, require active reviewer membership in its workspace, require GitHub write, and require `PR_ANALYSIS` before calling `ReviewPullFacade.run`.

- [ ] **Step 8: Wire feature modules and run focused verification**

Import `AuthorizationModule` into repositories, dashboard, and review modules without creating a circular dependency. Run the Task 3 verification commands; expected all pass.

Commit: `feat(backend): enforce complete three-axis authorization`.

---

### Task 4: Complete Typed Frontend Authorization Clients

```yaml
dag:
  id: web-auth-clients
  purpose: Provide exact typed clients and pure permission predicates for member, global-user, claim, and repository UI.
  deps: [claim-quality-review]
  parallel_group: wave-1
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - apps/web/src/lib/auth.ts
      - apps/web/src/lib/auth.test.ts
      - apps/web/src/lib/workspace-permission.ts
      - apps/web/src/lib/workspace-permission.test.ts
    modules: [web-lib]
  verification:
    commands: [pnpm --filter @folio/web test auth workspace-permission, pnpm --filter @folio/web typecheck]
    expected: Selected tests and web typecheck pass.
  risk:
    collision: low
    external_write: false
    database: false
    deployment: false
    notes: Use the established fetch pattern because api-client server/browser behavior differs; never swallow mutation errors.
  handoff_payload:
    include_spec_sections: [Administration UI, Error Handling]
    include_plan_sections: [Task 4]
```

- [ ] **Step 1: Add RED tests for exact response envelopes**

Mock `fetch` and cover list, approve/suspend, member state transitions, role change, ownership/system-admin transfer, 403 message propagation, and 409 conflict propagation.

- [ ] **Step 2: Replace void mutation returns with typed results**

Define `WorkspaceMember`, `GlobalUser`, and mutation result payloads from the backend's exact fields. Centralize only response parsing in a concretely named `readApiPayload` function inside `auth.ts`; do not add a generic utility file.

Add missing `transferSystemAdmin(userId)` and ensure all calls use `/api/v1/admin`, not removed `/api/v1/auth/admin` paths.

- [ ] **Step 3: Make permission reasons explicit**

Add pure predicates:

```ts
export function repositoryActivationReason(ctx: WorkspaceContext): string | null {
  if (ctx.memberStatus !== "active") return "활성 워크스페이스 멤버만 변경할 수 있습니다.";
  if (ctx.role !== "owner" && ctx.role !== "admin") return "워크스페이스 관리자 권한이 필요합니다.";
  if (!hasEntitlement(ctx, "repo_activation")) return "현재 이용 범위에 저장소 활성화가 포함되지 않습니다.";
  return null;
}
```

Also cover `canManageMembers`, `canManageRoles`, and `canSeeSystemUsers` for null/suspended contexts.

- [ ] **Step 4: Run verification and commit**

Run Task 4 commands. Commit: `feat(web): complete authorization API clients`.

---

### Task 5: Wave 1 Specification Review

```yaml
dag:
  id: wave1-spec-review
  purpose: Review backend-retrofit and web-auth-clients against every endpoint and frontend contract.
  deps: [backend-retrofit, web-auth-clients]
  parallel_group: wave-1-review-a
  worktree_strategy: intra-worktree
  worker_role: spec-reviewer
  scope:
    files:
      - packages/db/src/repos/repositories.ts
      - apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts
      - apps/backend/src/application/repositories/repositories.facade.ts
      - apps/backend/src/application/dashboard/dashboard.facade.ts
      - apps/backend/src/interfaces/api/pulls/pulls.controller.ts
      - apps/web/src/lib/auth.ts
      - apps/web/src/lib/workspace-permission.ts
    modules: [backend-authorization, web-lib]
  verification:
    commands: [git diff "$(git merge-base main HEAD)"..HEAD -- apps packages]
    expected: Every action in the authorization matrix is enforced and every client matches the response envelope.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Read-only review after worker branches are integrated.
  handoff_payload:
    include_spec_sections: [Authorization Architecture, Existing Endpoint Retrofit, Administration UI]
    include_plan_sections: [Task 3, Task 4]
```

- [ ] Map each authorization-matrix row to controller/facade tests.
- [ ] Search for remaining `listByAccountLogin` authorization inference in dashboard/repositories.
- [ ] Confirm typed frontend clients use current endpoints and surface 403/409.
- [ ] Return `PASS` or exact gaps.

---

### Task 6: Wave 1 Code-Quality Review

```yaml
dag:
  id: wave1-quality-review
  purpose: Review integrated Wave 1 code for layering, transaction safety, duplication, and maintainability.
  deps: [wave1-spec-review]
  parallel_group: wave-1-review-b
  worktree_strategy: intra-worktree
  worker_role: quality-reviewer
  scope:
    files:
      - packages/db/src/repos/repositories.ts
      - apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts
      - apps/backend/src/application/repositories/repositories.facade.ts
      - apps/backend/src/application/dashboard/dashboard.facade.ts
      - apps/backend/src/interfaces/api/pulls/pulls.controller.ts
      - apps/web/src/lib/auth.ts
      - apps/web/src/lib/workspace-permission.ts
    modules: [backend-authorization, web-lib]
  verification:
    commands: [pnpm --filter @folio/backend typecheck, pnpm --filter @folio/web typecheck]
    expected: Both typechecks pass and no blocking review finding remains.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: A failed review creates a fix task and repeats Tasks 5 and 6.
  handoff_payload:
    include_spec_sections: [Testing And Review]
    include_plan_sections: [Task 3, Task 4]
```

- [ ] Inspect dependency direction and avoid controller-only security.
- [ ] Inspect transactional audit coupling and stale-state handling.
- [ ] Run fresh typechecks and return `PASS` or findings.

---

### Task 7: Build Workspace Member Administration UI

```yaml
dag:
  id: member-ui
  purpose: Implement owner/admin workspace member administration with correct action restrictions and feedback.
  deps: [wave1-quality-review]
  parallel_group: wave-2
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - apps/web/src/components/settings/workspace-members-admin.tsx
      - apps/web/src/components/settings/workspace-members-admin.test.tsx
    modules: [web-settings]
  verification:
    commands: [pnpm --filter @folio/web test workspace-members-admin]
    expected: All member UI tests pass.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Component only; settings page integration is Task 12 to avoid same-wave overlap.
  handoff_payload:
    include_spec_sections: [Administration UI]
    include_plan_sections: [Task 7]
```

- [ ] Write component tests for owner, admin, reviewer-target restrictions, suspended state, confirmation, mutation error, and 409 refresh.
- [ ] Implement a dense table using existing `Button` and semantic tokens. Admin sees only reviewer suspend/restore/remove; owner additionally sees role controls and ownership transfer.
- [ ] Use `window.confirm` or an existing dialog primitive for irreversible transfer, then call `router.refresh()` after success/conflict.
- [ ] Run tests and commit: `feat(web): add workspace member administration`.

---

### Task 8: Build System User Administration UI

```yaml
dag:
  id: system-user-ui
  purpose: Replace the obsolete pending-only surface with complete system-admin user lifecycle controls.
  deps: [wave1-quality-review]
  parallel_group: wave-2
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - apps/web/src/components/settings/system-users-admin.tsx
      - apps/web/src/components/settings/system-users-admin.test.tsx
      - apps/web/src/components/pending-users-admin.tsx
    modules: [web-settings]
  verification:
    commands: [pnpm --filter @folio/web test system-users-admin]
    expected: All system-user UI tests pass and no production import of PendingUsersAdmin remains.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Delete the obsolete component only after repository-wide import search is empty.
  handoff_payload:
    include_spec_sections: [Administration UI]
    include_plan_sections: [Task 8]
```

- [ ] Test pending approve, active suspend, protected current system admin, transfer confirmation, mutation errors, and refresh.
- [ ] Implement the full global-user list with status and system-admin indicators using existing tokens.
- [ ] Remove `pending-users-admin.tsx` after `rg PendingUsersAdmin apps/web/src` proves no consumer.
- [ ] Run tests and commit: `feat(web): add system user administration`.

---

### Task 9: Gate Repository Activation UI

```yaml
dag:
  id: repository-ui-gate
  purpose: Make repository activation reflect workspace role and entitlement while leaving backend enforcement authoritative.
  deps: [wave1-quality-review]
  parallel_group: wave-2
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - apps/web/src/components/repository-toggle-form.tsx
      - apps/web/src/components/repository-toggle-form.test.tsx
      - apps/web/src/app/settings/repositories/page.tsx
      - apps/web/src/app/settings/repositories/page.test.ts
    modules: [web-settings]
  verification:
    commands: [pnpm --filter @folio/web test repository-toggle settings/repositories]
    expected: Role/entitlement gating and enabled mutation tests pass.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: GitHub admin is checked live by the backend, so UI text must not claim the browser has verified it.
  handoff_payload:
    include_spec_sections: [Administration UI, Existing Endpoint Retrofit]
    include_plan_sections: [Task 9]
```

- [ ] Test enabled owner/admin, disabled reviewer, suspended member, missing entitlement, and disabled-reason rendering.
- [ ] Fetch `WorkspaceContext` server-side with the forwarded session cookie.
- [ ] Pass `disabledReason: string | null` into `RepositoryToggleForm`; render a disabled button and adjacent/screen-reader-readable Korean explanation when non-null.
- [ ] Preserve existing filtering and server action behavior. Run tests and commit: `feat(web): gate repository activation controls`.

---

### Task 10: Wave 2 Specification Review

```yaml
dag:
  id: wave2-spec-review
  purpose: Verify all three settings components implement the approved role and entitlement behavior.
  deps: [member-ui, system-user-ui, repository-ui-gate]
  parallel_group: wave-2-review-a
  worktree_strategy: intra-worktree
  worker_role: spec-reviewer
  scope:
    files:
      - apps/web/src/components/settings/workspace-members-admin.tsx
      - apps/web/src/components/settings/system-users-admin.tsx
      - apps/web/src/components/repository-toggle-form.tsx
      - apps/web/src/app/settings/repositories/page.tsx
    modules: [web-settings]
  verification:
    commands: [pnpm --filter @folio/web test workspace-members-admin system-users-admin repository-toggle]
    expected: Tests pass and every approved role/action case is present.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Read-only review.
  handoff_payload:
    include_spec_sections: [Administration UI]
    include_plan_sections: [Task 7, Task 8, Task 9]
```

- [ ] Compare owner/admin/reviewer/system-admin behaviors to the design.
- [ ] Confirm backend remains authoritative and UI errors are actionable.
- [ ] Return `PASS` or exact gaps.

---

### Task 11: Wave 2 Code-Quality Review

```yaml
dag:
  id: wave2-quality-review
  purpose: Review settings UI accessibility, state handling, design-system compliance, and component boundaries.
  deps: [wave2-spec-review]
  parallel_group: wave-2-review-b
  worktree_strategy: intra-worktree
  worker_role: quality-reviewer
  scope:
    files:
      - apps/web/src/components/settings/workspace-members-admin.tsx
      - apps/web/src/components/settings/system-users-admin.tsx
      - apps/web/src/components/repository-toggle-form.tsx
      - apps/web/src/app/settings/repositories/page.tsx
    modules: [web-settings]
  verification:
    commands: [pnpm --filter @folio/web typecheck, pnpm --filter @folio/web test workspace-members-admin system-users-admin repository-toggle]
    expected: Typecheck/tests pass and no blocking accessibility or state bug remains.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: A failed review creates a fix task and repeats Tasks 10 and 11.
  handoff_payload:
    include_spec_sections: [Administration UI, Testing And Review]
    include_plan_sections: [Task 7, Task 8, Task 9]
```

- [ ] Inspect labels, focus, disabled reason, destructive confirmation, pending-state isolation, and error recovery.
- [ ] Confirm no undocumented token values or oversized mixed-responsibility component.
- [ ] Return `PASS` or findings.

---

### Task 12: Integrate Authorization Sections Into Settings

```yaml
dag:
  id: settings-integration
  purpose: Compose current context, workspace members, and system users on the real Workspaces settings route.
  deps: [wave2-quality-review]
  parallel_group: wave-3
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - apps/web/src/app/settings/workspaces/page.tsx
      - apps/web/src/app/settings/settings-routes.test.ts
      - apps/web/src/components/review/review-top-bar.tsx
      - apps/web/src/components/review/review-view.test.ts
    modules: [web-settings, web-review]
  verification:
    commands: [pnpm --filter @folio/web test settings-routes review-view, pnpm --filter @folio/web typecheck]
    expected: Settings composition, density contract, and web typecheck pass.
  risk:
    collision: low
    external_write: false
    database: false
    deployment: false
    notes: Integrates worker components after their branches are merged; reconcile the compact header against design-system intent rather than weakening the test.
  handoff_payload:
    include_spec_sections: [Administration UI, Completion Evidence]
    include_plan_sections: [Task 12]
```

- [ ] Add route-source tests proving context fetch, member section gating, and system-user section gating.
- [ ] Fetch user and `WorkspaceContext` with the same forwarded cookie. Fetch members only when `canManageMembers`; fetch global users only when `canSeeSystemUsers`.
- [ ] Render the two administration components in separate `SettingsCard`s while preserving the installation card.
- [ ] Reconcile `review-top-bar.tsx` with the compact density expectation `px-4 pt-3 md:px-6`, or update the expectation only if the approved design-system reference proves `py-4` is canonical.
- [ ] Run verification and commit: `feat(web): integrate authorization settings`.

---

### Task 13: Settings Integration Reviews

Two sequential read-only reviews are required.

```yaml
dag:
  id: settings-spec-review
  purpose: Confirm settings-integration exposes exactly the approved sections to the correct users.
  deps: [settings-integration]
  parallel_group: wave-3-review-a
  worktree_strategy: intra-worktree
  worker_role: spec-reviewer
  scope:
    files:
      - apps/web/src/app/settings/workspaces/page.tsx
      - apps/web/src/app/settings/settings-routes.test.ts
      - apps/web/src/components/review/review-top-bar.tsx
      - apps/web/src/components/review/review-view.test.ts
    modules: [web-settings, web-review]
  verification:
    commands: [pnpm --filter @folio/web test settings-routes review-view]
    expected: Tests pass and route gating matches the design.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Read-only review.
  handoff_payload:
    include_spec_sections: [Administration UI]
    include_plan_sections: [Task 12]
```

```yaml
dag:
  id: settings-quality-review
  purpose: Confirm integrated settings data flow, layout, and review-density fix are maintainable and accessible.
  deps: [settings-spec-review]
  parallel_group: wave-3-review-b
  worktree_strategy: intra-worktree
  worker_role: quality-reviewer
  scope:
    files:
      - apps/web/src/app/settings/workspaces/page.tsx
      - apps/web/src/app/settings/settings-routes.test.ts
      - apps/web/src/components/review/review-top-bar.tsx
      - apps/web/src/components/review/review-view.test.ts
    modules: [web-settings, web-review]
  verification:
    commands: [pnpm --filter @folio/web typecheck]
    expected: Typecheck passes and review returns PASS.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Failed review creates a fix and repeats both reviews.
  handoff_payload:
    include_spec_sections: [Testing And Review]
    include_plan_sections: [Task 12]
```

- [ ] Run spec review, record `PASS` or findings.
- [ ] After spec pass, run quality review, record `PASS` or findings.

---

### Task 14: Sync Real Development Secrets And Verify Migrations

```yaml
dag:
  id: dev-db-verification
  purpose: Populate the ignored local environment from 1Password, review/apply development migrations, and run all DB E2E tests without DB skips.
  deps: [settings-quality-review]
  parallel_group: wave-4
  worktree_strategy: coordinator-only
  worker_role: verifier
  scope:
    files:
      - .env
      - packages/db/drizzle
      - packages/db/test
      - apps/backend/src/application/authorization/workspace-claim.concurrency.e2e.test.ts
      - apps/backend/src/application/authorization/workspace-members.concurrency.e2e.test.ts
      - apps/backend/src/application/authorization/global-users.concurrency.e2e.test.ts
    modules: [environment, db, backend-e2e]
  verification:
    commands:
      - pnpm --filter @folio/db db:migrate
      - pnpm test
    expected: Migrations apply to development only; all tests pass and no DB-conditioned suite reports skipped.
  risk:
    collision: none
    external_write: true
    database: true
    deployment: false
    notes: Mandatory decision gate before migration/reset. Never print secrets. Confirm test DB safety before any truncate/reset command.
  handoff_payload:
    include_spec_sections: [Development Database And Secrets, Completion Evidence]
    include_plan_sections: [Task 14]
```

- [ ] **Step 1: Use `onepassword-env-sync`**

Read and follow `/Users/mugeon/orca/workspaces/Folio/croaker/.agents/skills/onepassword-env-sync/SKILL.md`. Generate the ignored `.env` from the authorized Folio development item. Report only key presence (`SET`/`MISSING`).

- [ ] **Step 2: Prove target safety without exposing the URL**

Parse the database hostname/database name locally and compare against the project's expected development identifiers without printing credentials. Confirm the target is not the production database. If identity is ambiguous, stop at a decision gate.

- [ ] **Step 3: Inspect pending migrations and open the required DB gate**

Record migration filenames and current migration journal state. Present schema/data effects and rollback limitations. Await explicit approval before applying migrations or running reset-capable E2E tests.

- [ ] **Step 4: Apply migrations and run DB suites**

After approval:

```bash
pnpm --filter @folio/db db:migrate
pnpm --filter @folio/db test
pnpm --filter @folio/backend test workspace-claim.concurrency workspace-members.concurrency global-users.concurrency
```

Expected: all DB and concurrency suites run (not skip) and pass. Confirm migrations are present in the journal.

- [ ] **Step 5: Secret hygiene check**

Run `git status --short --untracked-files=all`, `git check-ignore -v .env`, and a tracked-file secret pattern scan. Expected: `.env` ignored, no secret-bearing tracked diff, and no plaintext secret in command output.

---

### Task 15: Full Verification And Orca Browser Smoke

```yaml
dag:
  id: final-verification
  purpose: Prove the entire repository and core authenticated product flow after all implementation and DB work.
  deps: [dev-db-verification]
  parallel_group: wave-5
  worktree_strategy: intra-worktree
  worker_role: verifier
  scope:
    files: [entire repository]
    modules: [all]
  verification:
    commands: [pnpm lint, pnpm typecheck, pnpm test, pnpm build]
    expected: Every command exits 0; DB suites are not skipped; browser flow has no unexplained console/network failure.
  risk:
    collision: none
    external_write: false
    database: true
    deployment: false
    notes: Browser mutations target only the approved development environment and test fixtures.
  handoff_payload:
    include_spec_sections: [Completion Evidence]
    include_plan_sections: [Task 15]
```

- [ ] Run `pnpm lint` and require exit 0.
- [ ] Run `pnpm typecheck` and require exit 0.
- [ ] Run `pnpm test` with development DB env and require zero failures and zero DB-conditioned skips.
- [ ] Run `pnpm build` and require exit 0.
- [ ] Start backend on 8080 and web on 5173 in Orca-managed non-agent terminals.
- [ ] Open an Orca browser tab, start console/network capture, and verify dev login → dashboard.
- [ ] Verify `/settings/workspaces` renders the permitted member/system sections and complete one reversible member action against fixture data.
- [ ] Verify `/settings/repositories` gating and one reversible activation toggle against a fixture repository.
- [ ] Open a fixture PR review, change viewed state, and verify state persists after reload. If a safe fixture supports it, create a clearly marked smoke comment; otherwise verify the comment control without an external GitHub write.
- [ ] Stop capture and require no unexplained 4xx/5xx or console error. Stop the local servers.

---

### Task 16: Final Whole-Change Reviews And Completion Audit

```yaml
dag:
  id: final-review
  purpose: Audit every approved requirement and review the integrated change before declaring completion.
  deps: [final-verification]
  parallel_group: wave-6
  worktree_strategy: intra-worktree
  worker_role: spec-reviewer
  scope:
    files: [entire branch diff, design, plan, verification output]
    modules: [all]
  verification:
    commands: [git diff main...HEAD --stat, git status --short, pnpm lint, pnpm typecheck, pnpm test, pnpm build]
    expected: Requirement matrix has evidence for every row; commands exit 0; only ignored local secrets remain outside git.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Run a separate code-quality pass after spec compliance. Any finding creates a fix task and re-runs affected reviews and final verification.
  handoff_payload:
    include_spec_sections: [all]
    include_plan_sections: [all]
```

- [ ] Build a requirement-to-evidence matrix for every design section and original RBAC Tasks 18–24.
- [ ] Run a spec-compliance review and require `PASS`.
- [ ] Run a separate code-quality review over the integrated diff and require `PASS`.
- [ ] Re-run any command invalidated by review fixes.
- [ ] Confirm no migration, smoke-flow, secret-hygiene, or browser evidence is missing.
- [ ] Update the Orca worktree comment with the verified outcome and only then mark the goal complete.

## Wave And Merge Strategy

- **wave-0:** `claim-core` in the active worktree because its uncommitted edits already exist there.
- **wave-0-review:** `claim-spec-review` → `claim-quality-review`, read-only in the active worktree.
- **wave-1:** `backend-retrofit` and `web-auth-clients` in separate child worktrees; merge only after their local tests pass.
- **wave-1-review:** integrated spec review → integrated quality review.
- **wave-2:** `member-ui`, `system-user-ui`, and `repository-ui-gate` in three separate child worktrees. Their file scopes do not overlap.
- **wave-2-review:** integrated spec review → integrated quality review.
- **wave-3:** `settings-integration`, then sequential reviews.
- **wave-4:** coordinator-only 1Password sync and development DB decision gate/application.
- **wave-5:** whole-repository verification and Orca browser smoke.
- **wave-6:** final specification audit and separate whole-change quality review.

Worker commits are integrated only after the worker reports exact test output. If two branches unexpectedly touch the same file, stop integration and create a decision gate instead of auto-resolving semantic conflicts.

## Dispatch Gate

Spec: `docs/superpowers/specs/2026-07-11-rbac-core-completion-design.md`

Plan: `docs/superpowers/plans/2026-07-11-rbac-core-completion.md`

Waves:

- wave-0: `claim-core` using `intra-worktree`, after the existing Claude terminal hands off.
- wave-1: `backend-retrofit`, `web-auth-clients` using separate `inter-worktree` workers.
- wave-2: `member-ui`, `system-user-ui`, `repository-ui-gate` using three separate `inter-worktree` workers.
- wave-3: `settings-integration` using one `inter-worktree` worker.
- wave-4: `dev-db-verification` coordinator-only.
- wave-5/6: final verifier and read-only reviewers in the integrated worktree.

Risks:

- Existing Task 18 edits are active in the shared worktree; wait for handoff and reconcile before dispatch.
- Claim security depends on binding installation callback, session user, installation ID, and expiry; dedicated token tests and two reviews cover it.
- Dashboard login-based queries are spread across helper modules; repository-wide search and isolation tests cover them.
- DB E2E performs reset/truncate behavior; target identity and an explicit DB gate precede execution.
- Secrets must never reach git or logs; 1Password sync and a final tracked-file scan enforce this.

Verification:

- `pnpm lint` expects exit 0.
- `pnpm typecheck` expects exit 0.
- `pnpm test` with development DB expects zero failures and zero DB-conditioned skips.
- `pnpm build` expects exit 0.
- Orca browser smoke expects successful login, dashboard, workspace settings, repository settings, and persisted PR viewed state without unexplained console/network errors.

Decision gates:

- Existing worker has not handed off or still overlaps Task 0 files.
- Any migration generation or application.
- Any development DB reset/truncate until the exact non-production target is proven.
- Missing/locked 1Password item or ambiguous credential target.
- Any production database, deployment, or external GitHub write not explicitly identified as a safe smoke fixture.
- Ambiguous review/verification failure or overlapping worker edits.

**Approve worker dispatch?**
