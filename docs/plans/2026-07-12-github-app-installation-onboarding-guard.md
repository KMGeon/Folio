# GitHub App Installation Onboarding Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block Folio product routes with a clear installation modal until the
signed-in user belongs to a workspace that has an active GitHub App install.

**Architecture:** The backend makes installation-to-GitHub-account linkage
durable during webhook sync and protected workspace claims. The current
workspace endpoint derives one shared onboarding state from the membership and
active installations. `AppLayout` resolves that context server-side and passes
the state to a focused client overlay, avoiding a visible dashboard flash.

**Tech Stack:** NestJS, Drizzle repositories, Zod shared types, Next.js App
Router, React 19, Vitest, happy-dom, Tailwind design tokens, lucide-react.

## Global Constraints

- Use the existing response envelope and `/api/v1/workspaces/current` endpoint;
  do not add a client-side GitHub installation probe.
- Persist `githubAccountId` on each webhook installation sync and protected
  workspace claim; only `suspendedAt === null` counts as active.
- Onboarding values are exactly `ready`, `install_required`,
  `reinstall_required`, and `membership_suspended`.
- Protect product routes, bypass `/onboarding/install` and `/admin`, and never
  present an installation modal when workspace-context loading fails.
- Reuse existing dark-mode tokens, `Button`, Lucide icons, and dense spacing;
  introduce no new colour values or dependency.
- Follow the workspace → memberships → users write-lock order for claim
  authority changes; do not bypass Husky.
- Every production change starts with a focused failing test, then the minimal
  implementation, then a focused green run.

---

## File structure

- `packages/types/src/authorization.ts` owns the onboarding-state constants,
  schema, and shared type.
- `packages/github/src/webhook/events.ts` exposes the stable installation
  account ID and type needed by the backend webhook service.
- `packages/db/src/repos/installations.ts` preserves the stable account link on
  installation upserts.
- `apps/backend/src/application/github/installation-sync.facade.ts` records
  webhook account identity before reconciling repositories.
- `apps/backend/src/application/authorization/workspace-claim.facade.ts`
  records the verified callback installation and derives the context state.
- `apps/web/src/components/installation-onboarding-gate.tsx` owns only modal
  presentation and route bypasses.
- `apps/web/src/components/app-layout.tsx` is the server composition boundary
  for resolving the initial workspace context.

### Task 1: Preserve installation account identity from GitHub webhooks

**Files:**

- Modify: `packages/github/src/webhook/events.ts`
- Modify: `packages/db/src/repos/installations.ts`
- Modify: `apps/backend/src/application/github/installation-sync.facade.ts`
- Test: `apps/backend/src/application/github/installation-sync.facade.test.ts`
- Test: `apps/backend/src/domain/github/github-webhook.service.test.ts`

**Interfaces:**

- Produces `InstallationAccount = { githubAccountId: number; login: string; type: AccountType }`.
- Produces installation rows whose `githubAccountId` is retained by
  `installationsRepo.upsertByGithubId`.
- Consumes the typed `installation.account.id`, `login`, and `type` in the
  webhook service.

- [ ] **Step 1: Write failing sync-facade and webhook-service tests**

  In `installation-sync.facade.test.ts`, make the first sync input include the
  account ID and require it in the repository upsert assertion:

  ```ts
  await facade.sync({
    githubInstallationId: 123,
    account: { githubAccountId: 42, login: "acme", type: "Organization" },
  });

  expect(upsertByGithubId).toHaveBeenCalledWith({
    githubInstallationId: 123,
    githubAccountId: 42,
    accountLogin: "acme",
    accountType: "Organization",
  });
  ```

  In `github-webhook.service.test.ts`, create an `installation.created` payload
  whose account contains `{ id: 42, login: "acme", type: "Organization" }` and
  assert the sync dependency receives the same `githubAccountId`.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```bash
  pnpm --filter @folio/backend exec vitest run \
    src/application/github/installation-sync.facade.test.ts \
    src/domain/github/github-webhook.service.test.ts
  ```

  Expected: assertions fail because `githubAccountId` is absent from the sync
  input and upsert payload.

- [ ] **Step 3: Add the stable account ID to the webhook and persistence path**

  Expand the parsed installation payload so its account has all identity fields:

  ```ts
  export interface InstallationEventPayload extends BasePayload {
    action: string;
    installation: InstallationRefPayload & {
      account: { id: number; login: string; type: "User" | "Organization" };
    };
  }
  ```

  Pass `githubAccountId: account.id` in `GitHubWebhookService.dispatch`. Extend
  `InstallationAccount`, the sync upsert input, and the repository conflict set
  clause so a received account ID is stored rather than discarded:

  ```ts
  set: {
    githubAccountId: input.githubAccountId,
    accountLogin: input.accountLogin,
    accountType: input.accountType,
    suspendedAt: input.suspendedAt ?? null,
    updatedAt: new Date(),
  }
  ```

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit the account-link persistence slice**

  ```bash
  git add packages/github/src/webhook/events.ts \
    packages/db/src/repos/installations.ts \
    apps/backend/src/application/github/installation-sync.facade.ts \
    apps/backend/src/application/github/installation-sync.facade.test.ts \
    apps/backend/src/domain/github/github-webhook.service.test.ts
  git commit -m "fix(backend): retain installation account identity"
  ```

### Task 2: Derive a shared workspace onboarding state

**Files:**

- Modify: `packages/types/src/authorization.ts`
- Test: `packages/types/src/authorization.test.ts`
- Modify: `apps/backend/src/application/authorization/workspace-claim.facade.ts`
- Test: `apps/backend/src/application/authorization/workspace-claim.facade.test.ts`
- Test: `apps/backend/src/interfaces/api/workspaces/workspace.controller.test.ts`

**Interfaces:**

- Produces `INSTALLATION_ONBOARDING_STATE` and
  `InstallationOnboardingState` from `@folio/types`.
- Extends `currentContext(userId)` with
  `onboardingState: InstallationOnboardingState`.
- Consumes `WorkspaceResolver.listInstallationsForWorkspace(githubAccountId)`.

- [ ] **Step 1: Write failing shared-type and context tests**

  Add the shared type assertion:

  ```ts
  expect(Object.values(INSTALLATION_ONBOARDING_STATE)).toEqual([
    "ready",
    "install_required",
    "reinstall_required",
    "membership_suspended",
  ]);
  ```

  Add `WorkspaceClaimFacade.currentContext` tests for each state. The ready
  fixture must return an active membership and
  `[{ githubAccountId: 42, suspendedAt: null }]`; the reconnect fixture must
  return an active membership and only `suspendedAt: now`; and the suspended
  fixture must use `MEMBERSHIP_STATUS.SUSPENDED`. Update the controller envelope
  fixture to include `onboardingState: "install_required"`.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```bash
  pnpm --filter @folio/types exec vitest run src/authorization.test.ts
  pnpm --filter @folio/backend exec vitest run \
    src/application/authorization/workspace-claim.facade.test.ts \
    src/interfaces/api/workspaces/workspace.controller.test.ts
  ```

  Expected: missing shared exports and missing `onboardingState` assertions.

- [ ] **Step 3: Add the contract, claim upsert, and state derivation**

  Add the constant, `enumFromConst` schema, and type to
  `packages/types/src/authorization.ts`. In `claimAsOwner`, retain the verified
  `installationId` in `ResolvedClaimInput` and upsert the installation within
  the claim transaction with the verified account identity:

  ```ts
  await installationsRepo.upsertByGithubId(
    {
      githubInstallationId: input.installationId,
      githubAccountId: input.githubAccountId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
    },
    transaction,
  );
  ```

  In `currentContext`, load workspace installations only after a workspace is
  resolved and derive the state in this precedence order:

  ```ts
  const onboardingState =
    membership?.status === MEMBERSHIP_STATUS.SUSPENDED
      ? INSTALLATION_ONBOARDING_STATE.MEMBERSHIP_SUSPENDED
      : !workspace
        ? INSTALLATION_ONBOARDING_STATE.INSTALL_REQUIRED
        : installations.some((installation) => installation.suspendedAt === null)
          ? INSTALLATION_ONBOARDING_STATE.READY
          : INSTALLATION_ONBOARDING_STATE.REINSTALL_REQUIRED;
  ```

  Return the value with the existing context fields. Keep the new installation
  upsert before membership mutation but preserve workspace → memberships → users
  lock ordering for the authority writes.

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run both commands from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit the workspace-context slice**

  ```bash
  git add packages/types/src/authorization.ts packages/types/src/authorization.test.ts \
    apps/backend/src/application/authorization/workspace-claim.facade.ts \
    apps/backend/src/application/authorization/workspace-claim.facade.test.ts \
    apps/backend/src/interfaces/api/workspaces/workspace.controller.test.ts
  git commit -m "feat(backend): expose installation onboarding state"
  ```

### Task 3: Render the non-dismissible product onboarding gate

**Files:**

- Create: `apps/web/src/components/installation-onboarding-gate.tsx`
- Test: `apps/web/src/components/installation-onboarding-gate.test.tsx`
- Modify: `apps/web/src/components/app-layout.tsx`
- Modify: `apps/web/src/lib/workspace-permission.ts`
- Test: `apps/web/src/lib/workspace-permission.test.ts`

**Interfaces:**

- Consumes `WorkspaceContext["onboardingState"]`.
- Produces `InstallationOnboardingGate({ onboardingState })`.
- `AppLayout` resolves the context on the server and supplies
  `onboardingState ?? null` to the gate.

- [ ] **Step 1: Write failing client gate and context-type tests**

  In the new component test, render the gate with each state. Assert that:

  ```ts
  expect(container.querySelector('[role="dialog"]')).toBeNull(); // ready
  expect(container.textContent).toContain("GitHub App 설치가 필요합니다");
  expect(container.querySelector("a")?.getAttribute("href")).toBe(installationUrl());
  expect(container.textContent).toContain("연결이 해제되었습니다");
  expect(container.querySelector("a")).toBeNull(); // membership_suspended
  ```

  Mock `next/navigation` with `usePathname`. Add a bypass assertion for
  `/onboarding/install` and `/admin/workspaces`. Update the workspace-context
  fixture in `workspace-permission.test.ts` so it includes
  `onboardingState: "ready"`.

- [ ] **Step 2: Run the focused frontend tests and verify they fail**

  Run:

  ```bash
  pnpm --filter @folio/web exec vitest run \
    src/components/installation-onboarding-gate.test.tsx \
    src/lib/workspace-permission.test.ts
  ```

  Expected: the component module and context property do not exist.

- [ ] **Step 3: Implement the server-composed gate**

  Add `onboardingState: InstallationOnboardingState` to `WorkspaceContext`.
  Make `AppLayout` an async server component. When `user` is present, assemble
  the request cookie exactly as existing pages do and call
  `getWorkspaceContext(cookieHeader)`; pass its state to the gate. A failed
  lookup returns `null`, which causes the gate to render nothing.

  Implement the client component with `usePathname`, `Github`, `PlugZap`,
  `installationUrl`, and `Button`. It returns `null` for null/ready state and
  the `/onboarding/install` or `/admin` paths. Otherwise, render a fixed
  full-viewport overlay with `role="dialog"`, `aria-modal="true"`, an
  `aria-labelledby` heading, and the appropriate Korean text. The install and
  reconnect states use the existing installation endpoint as an anchor button;
  the suspended state has no installation anchor.

- [ ] **Step 4: Run the focused frontend tests and verify they pass**

  Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit the UI gate slice**

  ```bash
  git add apps/web/src/components/installation-onboarding-gate.tsx \
    apps/web/src/components/installation-onboarding-gate.test.tsx \
    apps/web/src/components/app-layout.tsx \
    apps/web/src/lib/workspace-permission.ts \
    apps/web/src/lib/workspace-permission.test.ts
  git commit -m "feat(web): gate product routes on GitHub App setup"
  ```

### Task 4: Verify the integrated workflow

**Files:**

- Modify only files required to correct failures found by the verification
  commands below.

**Interfaces:**

- Consumes the completed Tasks 1–3 contracts.
- Produces a branch with no uncommitted changes and all repository checks green.

- [ ] **Step 1: Run formatting and lint verification**

  Run:

  ```bash
  pnpm lint
  ```

  Expected: exit code 0.

- [ ] **Step 2: Run repository type verification**

  Run:

  ```bash
  pnpm typecheck
  ```

  Expected: exit code 0.

- [ ] **Step 3: Run the full test suite**

  Run:

  ```bash
  pnpm test
  ```

  Expected: exit code 0 with no failing test files.

- [ ] **Step 4: Run the production build verification**

  Run:

  ```bash
  pnpm build
  ```

  Expected: exit code 0 for all workspace builds.
