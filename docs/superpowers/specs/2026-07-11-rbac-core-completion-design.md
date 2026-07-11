# RBAC Core Completion Design

## Goal

Complete Folio's existing RBAC authorization plan through its remaining Tasks 18–24 and
prove the core product flow against a real development Supabase database. Completion
includes the workspace claim/current-context flow, three-axis authorization on existing
APIs, role-aware administration UI, migration and database verification, and a browser
smoke test. Billing and payment-provider work remain out of scope.

## Existing Baseline

The branch already contains the authorization types and schema, workspace/member/audit
repositories, backfill migrations, pure authorization policy, entitlement seam, GitHub
permission levels, guards, system-admin bootstrap, workspace-member administration, and
global-user administration. Six uncommitted RED tests begin Task 18 and must be preserved
as the starting point.

This completion work extends the approved design in
`docs/superpowers/specs/2026-07-10-rbac-authorization-design.md`; it does not replace the
three-axis model or broaden subscription scope.

## Scope

### Included

- Finish Tasks 18–24 of the existing RBAC implementation plan.
- Reconcile all currently failing typecheck, unit, integration, and UI-density tests.
- Connect the local development profile to the real development Supabase database.
- Apply reviewed migrations to development and run database/concurrency E2E tests without
  database-related skips.
- Verify the login, dashboard, workspace administration, repository administration, and PR
  review flow in Orca's browser.
- Review every implementation slice for specification compliance and code quality.

### Excluded

- Billing, checkout, payment providers, subscription persistence, and billing webhooks.
- Workspace switching UI. The current context remains deterministic while all persistence
  and authorization boundaries continue to use stable workspace IDs.
- Production database migration or production deployment without a separate explicit
  decision gate.

## Authorization Architecture

Every protected product action combines three independent decisions with logical AND:

1. The authenticated GitHub user has the live action-specific repository permission.
2. The user has an active Folio membership with the required workspace role.
3. The user is entitled to the product feature when that action is entitlement-gated.

System-admin status never bypasses workspace membership or GitHub permission for customer
repository data. Membership and ownership administration remain accessible without a paid
entitlement.

The remaining implementation stays within the existing clean backend layers:

- `domain`: authorization decisions and entitlement contracts.
- `infrastructure`: GitHub verification, workspace resolution, persistence, and atomic
  membership transitions.
- `application`: claim, current-context, repository, and review orchestration.
- `interfaces`: guards, controllers, response envelope, and stable error mapping.

The frontend continues to use `api-client.ts`, existing dark-only OKLCH tokens, and existing
shadcn primitives. UI visibility is a usability hint; backend guards remain authoritative.

## Workspace Installation And Claim Flow

The secure installation/claim sequence is:

1. GitHub redirects to Folio with an OAuth code and `installation_id`.
2. Folio exchanges the code to establish the authenticated GitHub user.
3. Folio resolves the installation through the GitHub App API and derives the stable account
   ID, login, and account type from server-trusted GitHub data.
4. A database transaction upserts and locks the workspace by stable GitHub account ID.
5. The transaction inspects the current owner and the caller's membership.
6. If no owner exists, the caller becomes owner. If an owner exists, a missing caller joins
   as an active reviewer. Existing suspended membership is never silently recreated.
7. An explicit owner claim records `workspace_claim` with before/after state. Ordinary
   reviewer auto-join remains unaudited.
8. The transaction commits and the current context is re-read from persisted state.

Client-supplied account IDs, account logins, and roles are never treated as authorization
evidence. The callback installation and server-side GitHub response are the trust source.

Concurrent claims are protected twice: the workspace row is locked with `FOR UPDATE`, and
the partial unique owner constraint prevents a second owner at the database boundary. A
stale concurrent transition returns a conflict or re-reads the winning membership; it does
not overwrite newer state.

## Current Workspace Context

`GET /api/v1/workspaces/current` returns the deterministic current context used to bootstrap
the UI:

- workspace ID and display login, or `null` when the user has no membership;
- role and membership status;
- global status and system-admin flag;
- the list of entitled features.

Memberships are ordered by join time with a stable ID tie-breaker. The oldest membership is
the default context until workspace switching is designed. Repository and membership
queries never infer workspace identity from mutable GitHub login strings.

## Existing Endpoint Retrofit

The following minimum decisions apply:

| Action | Workspace role | GitHub level | Entitlement |
| --- | --- | --- | --- |
| Read dashboard/review | reviewer+ | read+ | `review_read` |
| Change viewed state | reviewer+ | read+ | `review_state_mutation` |
| Create GitHub comment | reviewer+ | write+ | `comment` |
| Trigger manual analysis | reviewer+ | write+ | `pr_analysis` |
| Enable/disable repository | admin+ | admin | `repo_activation` |
| Manage reviewer membership | admin+ with target limits | none | none |
| Change roles/transfer ownership | owner | none | none |
| Manage global users | system admin | none | none |

Repository listing and mutation resolve the user's workspace through membership, query only
that workspace, and reject cross-workspace repository IDs. Repository activation writes a
`repo_activation_change` audit record with before/after snapshots in the same transaction
as the state transition.

Body-scoped PR analysis performs an explicit GitHub write-level check because route-param
guards cannot authorize a repository named only in the request body.

## Administration UI

### Workspace Members

The Workspaces settings page shows owner/admin users a dense member table with identity,
role, and status. Admins may suspend, restore, or remove reviewer targets. Only owners may
change roles or transfer ownership. Ownership transfer requires explicit confirmation and
refreshes the server state after completion.

### System Users

The existing pending-user surface is folded into a system-admin-only user administration
section. It supports approve, suspend, and atomic system-admin transfer without duplicating
the old hardcoded-admin path.

### Repositories

Repository activation remains visible but is actionable only when workspace role,
entitlement, and server authorization permit it. Disabled actions explain the reason in
Korean. Mutation failures preserve the previous state and display actionable feedback.

No new colors, font sizes, or shadow tiers are introduced. All UI follows
`docs/design-system.md` and the canonical tokens in `apps/web/src/app/globals.css`.

## Error Handling

All controller results use the common API envelope. Authorization and conflict failures map
consistently:

- `401`: missing session or a globally non-active user;
- `403`: insufficient GitHub permission, workspace role, membership state, system-admin
  status, or entitlement;
- `404`: installation, workspace, membership, or repository not found within the caller's
  authorized scope;
- `409`: stale owner/system-admin transition or a concurrent invariant conflict;
- `5xx`: GitHub or database infrastructure failure after transaction rollback.

Logs contain identifiers and safe state metadata, never OAuth codes, session tokens,
database URLs, private keys, or access tokens. The frontend redirects on `401`, explains
`403`, and refreshes current state after `409`.

## Development Database And Secrets

Implementation uses the Folio `onepassword-env-sync` workflow to create the real local
`.env` from the authorized 1Password source. At minimum it supplies the development
`SUPABASE_DATABASE_URL` and the GitHub App values required for the selected smoke flow.

The generated environment file remains ignored and must never appear in commits, patches,
tool output, or final responses. Verification checks only presence and connectivity, not
plaintext values. If 1Password is unavailable or the required item is absent, execution
opens a credential decision gate instead of inventing or exposing a secret.

Before applying migrations, the coordinator records the pending migration set and opens the
required database decision gate. Approved migrations are applied only to the development
database. E2E fixtures run in the existing isolated reset strategy and are cleaned up by the
test harness.

Production database changes and production deployment are separate gates and are not
authorized by this design approval.

## Testing And Review

Every implementation task follows RED → GREEN → relevant regression testing. Coverage must
include:

- deterministic membership ordering and transaction propagation;
- one-owner and one-system-admin invariants under concurrency;
- claim rollback, conflict behavior, and explicit claim audit snapshots;
- suspended-membership non-recreation;
- workspace/repository isolation;
- all three authorization axes on pull and repository endpoints;
- common API envelope and error status mapping;
- role-based UI visibility and action availability;
- successful and failed member, user, and repository mutations;
- reconciliation of the existing compact review-density contract.

Each implementation slice receives a specification-compliance review followed by a
code-quality review. Failed reviews create explicit fix tasks and are re-reviewed.

## Completion Evidence

The work is complete only when all of the following are true:

1. Every requirement in RBAC plan Tasks 18–24 is mapped to implementation and test evidence.
2. `pnpm lint` exits successfully.
3. `pnpm typecheck` exits successfully.
4. `pnpm test` exits successfully with the development database connected and no
   database-related E2E skips.
5. `pnpm build` exits successfully.
6. The development migration journal and database show all reviewed migrations applied.
7. Orca browser verification covers login, dashboard, workspace administration, repository
   administration, and PR review, with network/console failures inspected.
8. Git status and secret scans prove that no credential-bearing file or plaintext secret is
   tracked.
9. All task-level specification and code-quality reviews pass, followed by a final
   whole-change review.

Only this evidence—not the presence of code or a worker completion message—supports marking
the core RBAC objective complete.
