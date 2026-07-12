# Folio System Admin Console Design

## Goal

Build a dedicated `/admin` console for Folio's single `system_admin`. The console
combines global access governance, read-only workspace oversight, audit investigation,
and read-only job operations without weakening the existing three-axis authorization
model.

The console is delivered in three independently deployable phases. This document fixes
the final information architecture and security boundary for all three phases and gives
detailed implementation scope for Phase 1.

## Confirmed Product Decisions

1. `/admin` is separate from customer-facing `/settings`.
2. Only the current `system_admin` may access Admin pages or Admin APIs.
3. A system admin never bypasses workspace membership or live GitHub repository
   permission to inspect customer repository content.
4. The final console contains Overview, Users, Workspaces, Audit log, and Operations.
5. The console uses a dedicated labeled sidebar beside Folio's permanent global rail.
6. The global rail shows the Admin entry only to the current system admin.
7. User lifecycle remains one-way: `pending -> active -> suspended`. Admin provides no
   restore or delete operation.
8. Audit history supports server-side search, filtering, and cursor pagination. CSV export
   is not part of this design.
9. Workspace oversight is metadata-only and read-only.
10. Operations is job observability only. It provides no retry, cancellation, queue pause,
    or worker control.
11. The Overview combines a small set of metrics with a needs-attention queue and recent
    audit activity.
12. Worker online/offline state is not inferred until a real heartbeat source exists.

## Delivery Decomposition

### Phase 1: Admin Foundation And Access Governance

- Admin route boundary, layout, sidebar, and global-rail entry.
- A Phase 1 Overview containing pending-user status and recent audit activity.
- Paginated global user administration.
- Global audit-log investigation.
- Existing user approval, suspension, and system-admin transfer operations.
- Required transaction and concurrency verification for the single-system-admin invariant.

Only ready routes appear in the Admin sidebar. Workspaces and Operations do not appear as
empty or disabled destinations during Phase 1.

### Phase 2: Workspace Oversight

- Paginated workspace list and workspace metadata detail.
- Owner, member-count, repository-count, enabled-repository-count, installation state, and
  recent-activity projections.
- Read-only member, repository, installation, and workspace-audit metadata.
- Workspace metrics and suspended-installation items added to Overview.

### Phase 3: Operations Observability

- Paginated job list and job detail.
- Queue status counts, attempts, leases, timing, and sanitized error summaries.
- Dead and distressed job items added to Overview.
- Final Overview with all four summary cards and the queue snapshot.

Each phase receives its own implementation plan and verification pass. Phase 2 and Phase 3
must not expand the mutation authority established in Phase 1.

## Information Architecture

The final route tree is:

```text
/admin
|-- overview
|-- users
|-- workspaces
|   `-- [workspaceId]
|-- audit
`-- operations
    `-- jobs/[jobId]
```

`/admin` redirects to `/admin/overview`. The global `w-12` rail remains present. A
dedicated 266px Admin sidebar sits beside it at desktop widths and follows the existing
responsive settings-shell behavior below `lg`.

The final sidebar contains:

- Overview
- Users, including a pending-count indicator when non-zero
- Workspaces
- Audit log
- Operations, including a distressed-job indicator when non-zero

The UI follows `docs/design-system.md`: dark-only surfaces, existing OKLCH tokens, compact
rows, hairline borders, existing shadcn primitives, and Lucide icons. It introduces no new
color, typography, radius, or shadow tier.

## Authorization Boundary

### Page Access

The Admin layout reads the authenticated session on the server. An unauthenticated request
redirects to login while preserving the requested Admin URL. An authenticated non-admin
request redirects to the dashboard. A user whose system-admin authority is transferred
away loses access on the next server request.

The global-rail Admin entry is not rendered for ordinary users. This is a usability rule,
not the security boundary.

### API Access

Every `/api/v1/admin/*` endpoint uses `SessionAuthGuard` followed by `SystemAdminGuard`.
Controllers return the common API envelope. Missing or misconfigured guard metadata fails
closed.

### Customer Data Boundary

Admin read models may return operational metadata only:

- workspace ID, account login, account type, and timestamps;
- owner and member identities, roles, statuses, and counts;
- repository identity, public/private flag, and Folio activation state;
- installation identity and suspended state;
- audit action metadata and approved before/after authorization snapshots;
- job status, attempts, timestamps, repository identity, lease metadata, and safe errors.

They must not return source code, diffs, chapters, comments, review content, OAuth values,
credentials, job results, or unrestricted job payloads. Admin APIs never call customer
review APIs on behalf of the system admin and never synthesize workspace membership or
GitHub permission.

## Final Overview

The final Overview is dense and action-oriented without becoming a control plane.

### Summary Cards

Exactly four primary cards appear:

1. Pending users
2. Workspaces
3. Enabled repositories
4. Distressed jobs

A distressed job is a job in `dead`, or a retryable `failed` job whose `runAfter` has
passed without being reclaimed. This definition is computed from persisted queue state;
it does not claim that a worker is online or offline.

### Needs Attention

The queue combines links to filtered read or management screens:

- pending users;
- dead or distressed jobs;
- suspended GitHub App installations.

Items navigate to the relevant screen. They do not execute mutations from Overview.

### Supporting Panels

- Recent audit shows the newest authorization events with actor, action, target, and time.
- Queue snapshot shows pending, running, retrying, succeeded in the last 24 hours, and dead
  in the last 24 hours.

Phase 1 renders only evidence backed by the Phase 1 APIs: pending users and recent audit.
Phase 2 and Phase 3 progressively add their approved cards and panels without placeholders.

## Phase 1 Detailed Design

### Admin Shell

Create an Admin layout and focused Admin sidebar rather than extending `SettingsShell`.
The global rail receives a system-admin-only Admin destination. Route labels and active
states derive from the current pathname. The shell remains responsible only for layout and
navigation; authorization context is resolved by the server layout boundary.

### Users

The Users page provides:

- search by GitHub login or email;
- status filter for pending, active, or suspended;
- stable server-side cursor pagination;
- identity, email, global status, system-admin status, and joined-at columns;
- Approve for pending users;
- Suspend for active non-system-admin users;
- read-only rows for suspended users;
- a separate system-admin transfer action.

Approve and Suspend use explicit confirmation, retain current server data during a failed
request, and refresh authoritative data only after success. The UI does not use optimistic
state transitions.

System-admin transfer opens a high-risk confirmation dialog naming the target and stating
that the current user will lose `/admin` access. A successful transfer redirects the former
admin to the dashboard. The current system admin cannot suspend themself, and the active
system admin cannot be suspended before authority is transferred.

### Audit Log

The Audit page supports:

- free-text search over resolved actor and target display identities;
- action filter;
- workspace filter;
- actor filter;
- target filter;
- inclusive start and end date filters;
- descending cursor pagination by `(createdAt, id)`;
- an expandable detail row for approved before/after snapshots.

Audit query results resolve actor, target, and workspace display metadata in bounded batch
queries. The API does not expose arbitrary database rows through the polymorphic target
fields. Global events have a null workspace and are labeled as system scope.

### Phase 1 Overview

The initial Overview shows:

- pending-user count;
- a needs-attention row linking to pending users when the count is non-zero;
- recent audit events.

It intentionally omits workspace and job cards until their query boundaries are delivered.

## API Design

The final API surface is:

```text
GET  /api/v1/admin/overview

GET  /api/v1/admin/users
POST /api/v1/admin/users/:id/approve
POST /api/v1/admin/users/:id/suspend
POST /api/v1/admin/system-admin/transfer

GET  /api/v1/admin/workspaces
GET  /api/v1/admin/workspaces/:workspaceId

GET  /api/v1/admin/audit-logs

GET  /api/v1/admin/jobs
GET  /api/v1/admin/jobs/:jobId
```

Phase 1 extends the existing mutation controller rather than creating parallel mutation
paths. It adds bounded list contracts and the audit and overview read endpoints.

### List Contracts

List endpoints accept a maximum page size of 100 and default to 25. Cursors are opaque to
the client and validated before use. A malformed cursor returns `400` rather than silently
starting from the first page.

Audit and job lists order descending by `(createdAt, id)`. User and workspace lists use a
documented stable sort plus an ID tie-breaker. Search input is trimmed, length-bounded, and
escaped through parameterized queries.

Responses include `items` and `nextCursor`; they do not include expensive total counts.
Overview endpoints own the small, purpose-specific aggregate counts needed by cards.

## Backend Architecture

Admin controllers delegate to focused application facades. Facades compose purpose-built
read repositories and existing mutation services. Controllers do not build database
queries, and Admin reads do not add system-admin bypasses to customer-facing facades.

Suggested boundaries are:

- `AdminOverviewFacade`: composes phase-available aggregate projections.
- `AdminUsersFacade`: paginated user reads plus existing lifecycle orchestration.
- `AdminAuditFacade`: authorized audit search and display projection.
- `AdminWorkspacesFacade`: workspace metadata list and detail in Phase 2.
- `AdminJobsFacade`: safe queue projections in Phase 3.

Repository modules are named after their concrete projections, not `helpers`, `utils`, or
`common`. Shared wire contracts are real `.ts` Zod modules in `@folio/types` when consumed
by both frontend and backend.

## Operations Data Safety

Phase 3 reads persisted `jobs` rows but exposes an explicit safe projection:

- allowed: ID, kind, status, attempts, max attempts, run-after time, lease expiry,
  opaque worker ID, safe repository identity, last update, and safe error summary;
- forbidden: result, unrestricted payload, dedupe key, review output, code, diff, comment,
  and credentials.

Error summaries are length-limited and scrubbed before returning from the API. The raw
stored error remains an internal diagnostic value. The UI labels queue and lease facts
precisely and never labels a worker healthy, unhealthy, online, or offline without a future
heartbeat model.

Webhook-delivery observability is not claimed by this design because Folio does not
currently persist a safe webhook event stream. Adding one requires a separate design for
retention, payload redaction, and delivery identity.

## Error Handling

- `401`: missing or expired session; the page flow redirects to login with return URL.
- `403`: non-admin access or authority lost during the session; the page flow redirects to
  the dashboard.
- `404`: requested user, workspace, or job does not exist within the Admin read model.
- `409`: stale user transition or concurrent system-admin transfer conflict.
- `5xx`: infrastructure failure; the UI retains previously loaded data and offers retry.

Mutation errors appear next to the initiating control and do not alter the displayed state.
List failures distinguish first-load failure from next-page failure so already loaded rows
remain usable.

## Testing Strategy

Each phase follows RED-GREEN implementation and verifies its own boundary.

### Phase 1 Required Evidence

- server layout redirects for unauthenticated and non-admin users;
- global rail visibility and Admin sidebar active states;
- controller coverage proving `SessionAuthGuard + SystemAdminGuard` on every route;
- user search, status filtering, stable cursor pagination, and malformed-cursor rejection;
- pending approval and active suspension happy and failure paths;
- suspended-user immutability;
- system-admin transfer confirmation and post-transfer access loss;
- transactional audit writes for approval, suspension, and transfer;
- a focused database concurrency test proving exactly one system admin after competing
  transfers;
- audit action, workspace, actor, target, date, and text filtering;
- audit cursor behavior when a new event is inserted between pages;
- common envelope and `400`/`401`/`403`/`404`/`409` mappings;
- empty, loading, first-load error, next-page error, and permission-loss UI states.

### Phase 2 Required Evidence

- workspace search and cursor pagination;
- correct owner/member/repository/installation aggregates;
- no cross-workspace mixing in list or detail projections;
- no customer review content in API responses;
- suspended-installation attention item behavior.

### Phase 3 Required Evidence

- queue status and distressed-job definitions;
- job filters and cursor pagination;
- result, unrestricted payload, and sensitive error data non-disclosure;
- correct lease and retry labels without worker-health inference;
- read-only behavior with no operations mutation endpoint.

Every phase finishes with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
Browser verification covers all delivered Admin routes, responsive navigation, network
failures, and console errors.

## Non-Goals

- Restoring or deleting suspended global users.
- Workspace membership, role, owner, or repository mutations from `/admin`.
- Reading customer PR bodies, source, diffs, chapters, review state, or comments.
- Retrying, canceling, pausing, or manually enqueuing jobs.
- Starting, stopping, or declaring health for workers.
- Webhook payload storage or webhook-delivery history.
- CSV audit export.
- Billing or subscription administration.
- Replacing the customer-facing Settings information architecture.

## Completion Criteria

The final Admin Console is complete when all three phases are delivered, every final route
is available only to the current system admin, the Overview contains only evidence-backed
metrics, Workspace and Operations remain read-only, no customer review content crosses the
Admin data boundary, and all required automated and browser verification passes.
