# RBAC Authorization Model (Subscription-Ready)

## Goal

Give Folio a real authorization model. Today authorization is ad-hoc: a hardcoded
`ADMIN_LOGIN = KMGeon`, a `users` table with only `pending`/`approved`, and a
`RepoAccessService` that collapses every non-`none` GitHub permission to a single
boolean (and bypasses checks in dev). This design replaces that with a **hybrid,
three-axis authorization model**:

1. **GitHub access axis** — may this human touch this repository's data at all,
   at the required GitHub permission level (live, per-action).
2. **Folio workspace-role axis** — which Folio functions may this member use
   inside a workspace (Folio-managed roles).
3. **Entitlement axis** — is this user entitled to paid product features
   (USER-scoped, subscription-ready but not yet enforced).

All three axes are checked **independently** and combined with AND. Passing one
never bypasses another.

Scope of *this* work is **end-to-end**: DB + migrations, backend policy/guards/APIs,
global user-management UI, workspace member-management UI, and role-driven UI
visibility. **Subscription/billing is explicitly out of scope** — no plan or
subscription tables, payment provider, billing webhook, or checkout. This work
builds only the *subscription-ready entitlement seam*.

## Confirmed Decisions

1. Hybrid authorization: global service role + workspace-scoped RBAC; live GitHub
   repository authorization is a separate axis.
2. Folio-managed workspace roles. GitHub permissions answer *may they access/act on
   repo data*; Folio roles answer *which Folio functions they may use*.
3. Subscription is **USER-scoped**, not workspace-scoped.
4. Only a subscription-ready entitlement boundary now — no plan/subscription tables,
   payment provider, billing webhook, or checkout.
5. `system_admin` never bypasses workspace membership or GitHub access to private
   customer repository data.
6. Approved active users auto-join a workspace as `reviewer` on first access, after
   the relevant GitHub access check. `owner`/`admin` elevation is always explicit.
7. Fixed workspace roles: `owner`, `admin`, `reviewer`. No `viewer` or custom roles.
8. Exactly one workspace `owner`. Ownership change is atomic; the current owner
   cannot leave or demote before transfer.
9. Admin delegation is limited: may suspend/restore/remove reviewers only. Only
   `owner` may elevate/demote roles and transfer ownership.
10. A reviewer removed by an admin is persisted as `suspended` so GitHub access
    cannot auto-recreate the membership; `owner`/`admin` may restore.
11. The workspace is the stable authorization/collaboration boundary, one per GitHub
    personal or org account, keyed by the **stable GitHub numeric account ID**. It
    survives App reinstall. It is **not** the billing boundary.
12. Future entitlement gates product use only: repository activation, PR analysis,
    review reading + state mutations, and comments. Login, subscription management,
    owner transfer, and membership/role management stay accessible without
    entitlement.
13. Global user lifecycle stays approval-based: `pending`, `active`, `suspended`.
    Separate from role. `system_admin` approves/suspends.
14. Persistent DB audit log covers: user approve/suspend, reviewer suspend/restore,
    role change, owner transfer, repository activation changes. Records actor,
    target, time, and before/after values. Auto-join reviewer creation is NOT
    audited.
15. Initial `system_admin` uses a one-time bootstrap from a stable GitHub numeric
    user ID, only when no `system_admin` exists. Once created, the setting grants no
    further authority.
16. Existing installations are claimed through an authenticated GitHub reconnect/
    claim flow. New installs bind the authenticated installer as `owner`.
17. GitHub permission minimum is action-specific: read+ for review viewing and
    personal viewed state; write+ for GitHub comments or manual analysis; admin for
    repository activation or connection settings.
18. Exactly one global `system_admin`, replaced only through atomic transfer.

## Architecture Overview

Clean layered backend (`apps/backend/src`) per AGENTS.md:

- **domain** — `AuthorizationPolicy` (pure decision functions), `EntitlementService`
  interface, and role/status domain models.
- **application** — facades call `AuthorizationPolicy` explicitly for complex
  branch decisions and orchestrate membership/audit writes.
- **infrastructure** — `WorkspaceMembershipService`, `WorkspaceResolver`, extended
  `RepoAccessService`, current `EntitlementService` implementation.
- **interfaces** — declarative guards + decorators protecting route entry points;
  common response envelope.
- **support** — shared authorization errors.

Shared types live in `@folio/types` as real `.ts` Zod modules.

## Section 1 — Data Model (`packages/db`)

### New tables

**`workspaces`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Folio internal ID |
| `github_account_id` | bigint, unique, not null | Stable numeric ID (Decision 11) — survives reinstall |
| `account_login` | text | Display only; mutable, not a trust key |
| `account_type` | enum(`user`,`org`) | |
| `created_at` / `updated_at` | timestamptz | |

**`workspace_members`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid FK → workspaces | |
| `user_id` | uuid FK → users | |
| `role` | enum(`owner`,`admin`,`reviewer`) | Decision 7 |
| `status` | enum(`active`,`suspended`) | Decision 10 |
| `elevated_by` / `suspended_by` | uuid FK → users, nullable | Delegation trail |
| `joined_at` / `updated_at` | timestamptz | |

Constraints: `unique(workspace_id, user_id)`; **partial unique index enforcing one
`role=owner` per workspace** (Decision 8).

**`audit_logs`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_user_id` | uuid FK → users | Actor |
| `action` | enum | `user_approve`, `user_suspend`, `member_suspend`, `member_restore`, `role_change`, `owner_transfer`, `repo_activation_change` |
| `target_type` / `target_id` | text / uuid | |
| `workspace_id` | uuid FK, nullable | Null for global actions |
| `before` / `after` | jsonb | Decision 14 |
| `created_at` | timestamptz | |

### Extended tables

- **`users`** — add `global_status` enum(`pending`,`active`,`suspended`) (migrate
  existing `pending`/`approved` → `pending`/`active`); add `is_system_admin` boolean
  default false, enforced to exactly one via partial unique index (Decision 18).
- **`installations`** — add `github_account_id` bigint, backfilled and linked to
  `workspaces`.
- **`repositories`** — add `workspace_id` uuid FK.

### Migration order (mandatory decision gate)

1. Create new tables/columns as nullable.
2. Backfill: `installations`/`repositories` → workspaces; `users.status` →
   `global_status` (`approved` → `active`); populate numeric account IDs.
3. Tighten NOT NULL / uniqueness constraints (owner-per-workspace,
   single-system-admin).

## Section 2 — Backend Authorization Architecture

### domain

**`AuthorizationPolicy`** — pure, side-effect-free decision functions. Input: actor
`{ globalStatus, isSystemAdmin }`, target `WorkspaceMembership { role, status }`,
requested action. Output: `allow | deny(reason)`. Encodes Decisions 5, 8, 9. Domain
models `WorkspaceRole`, `MembershipStatus`, `GlobalStatus`, `SystemRole` live in
`@folio/types`.

### infrastructure

- **`WorkspaceMembershipService`** — reads/writes `workspace_members`, writes
  `audit_logs`.
- **`WorkspaceResolver`** — resolves GitHub numeric account ID → workspace (survives
  reinstall); replaces `accountLogin == currentUser.login` inference so shared org
  membership is modeled.
- Extended **`RepoAccessService`** + `packages/github/repo-permission.ts` — return
  the action-specific GitHub level (read/write/admin, Decision 17) instead of a
  boolean; remove the dev bypass.

### application

Facades call `AuthorizationPolicy` explicitly for complex conditional decisions and
throw `support`-layer errors (e.g. `ForbiddenError`) → common envelope.

### interfaces (entry-point guards)

- **`@RequireWorkspaceRole('admin')`** + `WorkspaceRoleGuard` — loads membership,
  delegates to policy.
- **`@RequireGlobalStatus('active')`**, **`@RequireSystemAdmin()`**.
- **`EntitlementGuard`** + `@RequireEntitlement(feature)` (Section 4).
- Chains after the existing `SessionAuthGuard` (authn) → authorization guards.

### Two-axis (three with entitlement) enforcement

Every protected request checks the **GitHub access axis** and the **Folio role
axis** independently; both must pass. `system_admin` never bypasses the GitHub axis
(Decision 5). Entitlement adds a third independent axis (Section 4).

## Section 3 — Membership & Lifecycle Flows

### 3.1 Auto-join (Decisions 6, 16)

On first access to workspace data: (1) require global `active`; (2) pass the
action's GitHub access axis; (3) if no membership record, create `reviewer`/`active`;
(4) if an existing record is `suspended`, do NOT auto-recreate (Decision 10) —
explicit restore required; (5) `owner`/`admin` is never automatic. Auto-join is not
audited (Decision 14).

### 3.2 Admin delegation (Decision 9)

Admin may suspend/restore/remove reviewers. Only owner may elevate/demote roles and
transfer ownership. An admin acting on another admin or the owner is denied.

### 3.3 Reviewer removal = persisted suspend (Decision 10)

An admin "removing" a reviewer sets `status=suspended` rather than deleting the row,
blocking auto-recreation via 3.1(4). Owner/admin may restore.

### 3.4 Owner transfer (Decision 8) — atomic

Single transaction: current owner → admin (or chosen role), target → owner. The
owner cannot leave/demote before transfer. The partial unique index guarantees the
one-owner invariant at the DB level.

### 3.5 Global user lifecycle (Decision 13)

`system_admin` moves users `pending`→`active` and `active`→`suspended`, independent
of workspace role. A globally `suspended` user is blocked from all product access.

### 3.6 system_admin bootstrap (Decisions 15, 18)

Only when no `system_admin` exists, a one-time bootstrap grants it from a configured
stable GitHub numeric user ID. After creation the setting confers no further
authority. The hardcoded `ADMIN_LOGIN = KMGeon` is removed. Replacement is by atomic
transfer only.

### 3.7 Claim / new install (Decision 16)

- **New install** — bind the authenticated installer (current session user) as the
  workspace `owner`.
- **Existing install** — an authenticated GitHub reconnect/claim flow establishes
  ownership, matching the workspace by numeric account ID.

All state changes except 3.1 auto-join are recorded in `audit_logs` (Decision 14).

## Section 4 — Entitlement Seam (Subscription-Ready)

### domain

**`EntitlementService`** interface: `canUseFeature(userId, feature)` →
`entitled | notEntitled(reason)`. `EntitlementFeature` (only Decision-12 gated
features): `repo_activation`, `pr_analysis`, `review_read`,
`review_state_mutation`, `comment`.

### Current implementation

`AlwaysEntitledService` returns `entitled` for every `active` user. No subscription/
plan lookup (Decision 4). A future `SubscriptionEntitlementService` replaces only the
implementation; call sites and gates are unchanged.

### Gate attachment (Decision 12)

Gated: repo activation, PR analysis, review read + state mutation, comment. Always
accessible without entitlement: login, subscription management (future), owner
transfer, membership/role management. `EntitlementGuard` + `@RequireEntitlement(...)`
are wired now but currently always pass. Entitlement is USER-scoped (Decision 3) — a
third independent axis: GitHub access ∧ Folio role ∧ (if applicable) entitlement.

## Section 5 — API Surface (interfaces, common envelope)

### Workspace members — `/api/v1/workspaces/:workspaceId/members`

| Method | Path | Min authority | Action |
|---|---|---|---|
| GET | `/members` | reviewer+ | List members (role/status) |
| POST | `/members/:userId/suspend` | admin+ (reviewer target only) | 3.2/3.3 |
| POST | `/members/:userId/restore` | admin+ | suspended→active |
| DELETE | `/members/:userId` | admin+ (reviewer target only) | remove = persisted suspend |
| PATCH | `/members/:userId/role` | owner only | elevate/demote |
| POST | `/transfer-ownership` | owner only | atomic transfer (3.4) |

### Global users — `/api/v1/admin/users` (system_admin)

| Method | Path | Action |
|---|---|---|
| GET | `/users` | List global users (extends existing pending) |
| POST | `/users/:userId/approve` | pending→active |
| POST | `/users/:userId/suspend` | active→suspended |
| POST | `/system-admin/transfer` | atomic system_admin transfer (Decision 18) |

### Claim / bootstrap — `/api/v1/workspaces`

| Method | Path | Action |
|---|---|---|
| POST | `/claim` | Claim existing install via authenticated session → owner (3.7) |
| GET | `/current` | Current user's workspace + role/entitlement summary (UI bootstrap) |

### Corrections to existing endpoints

- **`POST /api/v1/pulls`** — currently body-scoped and session-only; add
  `WorkspaceRoleGuard` + GitHub write axis + `@RequireEntitlement('pr_analysis')`.
- **Repositories enable/disable** — remove account-login inference; require workspace
  `admin` role + GitHub admin axis (Decision 17) + `@RequireEntitlement('repo_activation')`.
- **Pulls/Dashboard reads** — reviewer+ role + GitHub read axis +
  `@RequireEntitlement('review_read')`.
- Facade installation discovery moves from `accountLogin == currentUser.login` to
  `WorkspaceResolver`.

## Section 6 — Frontend (`apps/web`, role-based sections within settings)

### Bootstrap & visibility

After login, `GET /workspaces/current` loads `{ role, memberStatus, globalStatus,
entitlements[] }` into a client permission context (e.g. `useWorkspaceRole()`). All
calls go through `api-client.ts`. Sample/mock structure is preserved while swapping
in real data.

### settings sections (role-gated)

- **Workspace members** — visible to owner/admin only: member table (avatar/login/
  role/status); reviewer-row suspend/restore/remove for admin+; role dropdown and
  owner-transfer button for owner only (backend is the final enforcer, UI is a hint);
  owner transfer shows a confirmation dialog (atomic, irreversible).
- **System users** — visible to system_admin only: existing `pending-users-admin.tsx`
  folded in, plus approve/suspend and system_admin transfer.
- **Repository activation** — existing `repository-toggle-form.tsx` retained, with
  button enable/disable gated by workspace admin role + entitlement.

### Entitlement UI (Decision 12)

Gated features are disabled with guidance when not entitled. Currently everyone is
entitled, so there is no visible change, but the wiring is complete. Login,
membership/role management, and owner transfer stay accessible regardless.

### Design system

Dark-only; `globals.css` OKLCH tokens; shadcn primitives in `components/ui` only. No
new colors/fonts/shadows. Role and status badges use existing semantic tokens.

## Section 7 — Testing & Verification

### Unit (domain, highest priority)

- **`AuthorizationPolicy`** — exhaustive table: admin acting on admin/owner (deny,
  Decision 9), one-owner invariant, `system_admin` cannot bypass GitHub axis
  (Decision 5), three-axis AND combinations.
- **`EntitlementService`** — `AlwaysEntitledService` allows every active user;
  handles non-active.

### Integration (guards + facades)

- `WorkspaceRoleGuard` / `EntitlementGuard` / `RequireSystemAdmin` actually block
  entry points.
- Auto-join: new access → reviewer created; suspended record → no recreation
  (Decision 10); global `pending` → blocked.
- Owner transfer and system_admin transfer atomicity (rollback on partial failure,
  invariants hold).
- `audit_logs` records each explicit action with before/after (Decision 14);
  auto-join is not recorded.

### Migration (decision gate)

- `users.status` (`approved`) → `global_status` (`active`) mapping.
- `installations` → `workspaces` backfill and numeric account ID population.
- Data integrity before constraint tightening (one owner, one system_admin).

### Frontend

- Section/action visibility renders per permission context (role-based snapshots).

### Final verification (AGENTS.md)

`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. No `--no-verify`, no
`max-lines` disable.
