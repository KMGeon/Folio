# Folio Admin Phase 2: Workspace Oversight Design

## Goal

Deliver metadata-only, read-only workspace oversight for the system admin console:
paginated workspace list, workspace detail, Overview workspace metrics, and a
suspended-installation needs-attention item. Phase 3 Operations remains out of scope.

This document freezes Phase 2 wire contracts and safety boundaries on top of
[`2026-07-11-system-admin-console-design.md`](./2026-07-11-system-admin-console-design.md).

## Confirmed Decisions

1. Approach: Phase 1 mirror with a dedicated `admin-workspaces` projection module.
   Do not extend customer workspace facades or synthesize membership/GitHub permission.
2. Recent activity: latest workspace-scoped audit log `createdAt` for that
   `workspaceId`. If none, `null`.
3. List sort: `(createdAt desc, id desc)` with the existing opaque admin page cursor.
4. Search: trim + max 100 chars, `ilike` on `workspaces.accountLogin` only.
5. Optional list filter `installationState` so Overview attention can deep-link.
6. Detail repository fields are identity/activation metadata only:
   `id`, `fullName`, `private`, `folioEnabled`.
7. Detail recent audit cap: 10 items, same safe projection shape as Admin audit items
   (or a strict subset of that shape).
8. No schema migration if existing tables suffice (they do).

## Routes

```text
/admin/workspaces
/admin/workspaces/[workspaceId]
```

Admin sidebar gains a ready **Workspaces** item. Active state covers both list and detail
paths. Operations remains hidden until Phase 3.

## API

All endpoints use `SessionAuthGuard` then `SystemAdminGuard` and the common API envelope.

```text
GET /api/v1/admin/workspaces
GET /api/v1/admin/workspaces/:workspaceId
```

### Query: list

| Param | Rules |
| --- | --- |
| `limit` | int 1–100, default 25 |
| `q` | optional, trim, max 100; search `accountLogin` |
| `cursor` | optional opaque admin cursor; malformed → `400` |
| `installationState` | optional enum: `none`, `active`, `suspended`, `mixed` |

Response: `{ items, nextCursor }` — no expensive total counts.

### Errors

| Code | When |
| --- | --- |
| `400` | invalid query or malformed cursor |
| `401` | missing/expired session |
| `403` | non-admin or authority lost |
| `404` | workspace id not found in admin read model |
| `5xx` | infrastructure failure |

## Wire Contracts (`@folio/types`)

All schemas use `.strict()` allowlists.

### `AdminWorkspaceInstallationState`

`none | active | suspended | mixed`

Derivation from installations sharing the workspace `githubAccountId`:

- no rows → `none`
- any suspended and any non-suspended → `mixed`
- all suspended → `suspended`
- otherwise → `active`

### `AdminWorkspaceItem`

| Field | Meaning |
| --- | --- |
| `id` | workspace UUID |
| `accountLogin` | GitHub account login |
| `accountType` | `User` / `Organization` |
| `createdAt` | ISO datetime |
| `owner` | `{ id, login, avatarUrl } \| null` from membership `role=owner` |
| `memberCount` | count of all membership rows for the workspace |
| `repositoryCount` | repos with `workspaceId = id` |
| `enabledRepositoryCount` | same + `folioEnabled = true` |
| `installationState` | derived state above |
| `recentActivityAt` | max `audit_logs.createdAt` where `workspaceId = id`, else `null` |

### `AdminWorkspacePage`

`{ items: AdminWorkspaceItem[], nextCursor: string | null }`

### `AdminWorkspaceDetail`

Extends list item fields with:

- `members[]`: `id`, `userId`, `login`, `avatarUrl`, `role`, `status`, `joinedAt`
- `repositories[]`: `id`, `fullName`, `private`, `folioEnabled`
- `installations[]`: `id`, `githubInstallationId`, `accountLogin`, `accountType`, `suspendedAt`
- `recentAudit[]`: up to 10 workspace-scoped audit projections (reuse Admin audit item
  shape or a strict subset: action, actor, target, createdAt)

### Overview (Phase 2 extension)

```ts
metrics: {
  pendingUsers: number;
  workspaces: number;            // total workspaces
  enabledRepositories: number;   // global folioEnabled=true
}
attention: Array<
  | { kind: "pending_users"; count: number }              // count > 0 only
  | { kind: "suspended_installations"; count: number }    // count > 0 only
>
recentAudit: AdminAuditItem[]; // unchanged max 5
```

Do **not** add distressed jobs, queue snapshot, or Operations cards.

Suspended-installations attention links to:

`/admin/workspaces?installationState=suspended`

Empty attention when count is 0 (no row rendered).

## Backend Architecture

Suggested boundaries (concrete names, not helpers/utils):

| Unit | Responsibility |
| --- | --- |
| `packages/db/src/repos/admin-workspaces.ts` | list page + batch aggregates + detail loaders |
| `AdminWorkspacesFacade` | cursor encode/decode, DTO projection |
| `AdminWorkspacesController` | HTTP + query parse |
| `AdminOverviewFacade` | add workspace/enabled-repo metrics + suspended attention |
| `admin-query.ts` | parse workspace list query |
| `authorization.module.ts` | register facade + controller |

### Query safety

- List batch aggregates key only by the workspace IDs returned on the current page.
- Detail loaders fix `workspaceId` (or that workspace's `githubAccountId` for installs)
  on every join/batch lookup so other workspace rows cannot mix in.
- Cursors reuse `admin-page-cursor` (`createdAt` + `id`).
- Never call customer review APIs from Admin.

### Forbidden response content

Source code, diffs, chapters, comments, review state, OAuth/credentials, job
payload/result, unrestricted audit internals beyond approved snapshots already used in
Phase 1 audit projection.

## Frontend

Reuse Phase 1 shell, page header, server-access, and list client patterns.

| Piece | Behavior |
| --- | --- |
| Sidebar | Add Workspaces; active on list + detail paths |
| List page | search + optional installationState filter; cursor load-more |
| Detail page | read-only sections: metadata, members, repositories, installations, recent audit |
| Overview | three metric cards; pending-users + suspended-installations attention |
| Errors | first-load vs next-page; retain loaded rows on next-page failure; 403 → dashboard |
| Design system | existing OKLCH tokens + shadcn only; dark-only |

No mutation controls for workspace/member/repository/installation.

## Testing Evidence (required)

Non-DB unit/controller/UI tests; do not run DB E2E or start servers under safety constraints.

1. Workspace search + stable cursor + malformed cursor `400`.
2. Owner / member / repository / enabled-repository / installation / recent-activity aggregates.
3. List and detail: no cross-workspace mixing.
4. Allowlist assertion: response keys ⊆ approved schema fields (no review content).
5. Suspended-installation attention: count, link, empty when zero.
6. Sidebar active state; list/detail empty/loading/first-load error/next-page error/permission-loss UI.
7. Phase 1 users/audit/overview regressions remain green.

## Safety Constraints For Implementers

- Do not connect to real/prod DB; do not read or use `.env` / `.env.dev` / `.env.prd`.
- Do not start backend/frontend servers.
- Do not run DB E2E or concurrency E2E.
- Run safe lint/typecheck/test with `SUPABASE_DATABASE_URL=` explicitly empty.
- Do not run `pnpm build` or browser verification without user approval; report as unverified.
- Prefer existing schema; if migration seems required, prove with static design first.

## Non-Goals

- Workspace/member/repository/installation mutations from Admin.
- Customer PR/source/diff/chapter/comment access.
- Phase 3 jobs/operations/distressed metrics.
- CSV export, billing admin, multi-admin.

## Completion Criteria

Phase 2 is done when list + detail + Overview extensions ship behind system-admin guards,
all required non-DB evidence passes, design-system rules hold, and the implementer reports
what was verified vs skipped under safety constraints.
