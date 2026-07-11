# Repository Review Settings Design

## Summary

Folio will show every repository known to the current workspace in a dense settings table and
let workspace administrators decide which connected repositories receive Folio review processing.
The screen follows the supplied Stage reference: a repository card with a GitHub management link,
search, repository rows, and a compact per-repository switch.

The existing `folioEnabled` setting remains the single automation control in the first version.
Turning it off stops new review generation and regeneration but does not delete or hide reviews
that Folio already created.

## Goals

- List repositories granted to the workspace's GitHub App installation.
- Let authorized workspace administrators enable or disable Folio review processing per repository.
- Build the GitHub App management link from the active installation's GitHub installation ID.
- Preserve repository and review history when GitHub App access to a repository is removed.
- Make disconnected, unauthorized, empty, and failure states explicit in the settings UI.

## Non-goals

- Separate switches for opened PRs, new commits, closed PRs, badges, or GitHub comments.
- Deleting existing reviews when a repository is disabled or disconnected.
- Fetching GitHub repository state synchronously whenever the settings page loads.
- Adding a manual "sync now" action in the first version.

## Decisions

### One review-processing switch

Each repository has one `Folio review` switch backed by the existing `folioEnabled` field. New
repositories default to off. This prevents Folio from processing repositories merely because an
installation grant changed.

Turning the switch off excludes the repository from new PR webhook jobs, regeneration jobs, and
the dashboard's active-repository scope. Existing review URLs and stored review data remain
readable.

### Persist GitHub access state

Add a non-null `githubAccessActive` boolean to `repositories`. It defaults to true for the migration
because all existing rows came from repositories accessible to an installation when they were
synced. The field describes GitHub App access independently from the user's Folio preference.

| GitHub access | Folio review | Meaning |
| --- | --- | --- |
| Active | On | New and changed PRs can be processed. |
| Active | Off | Connected but excluded from new processing. |
| Disconnected | Off | History is retained; new processing is prohibited. |

`Disconnected + On` is not a valid persisted state. Removing GitHub access atomically sets
`githubAccessActive=false` and `folioEnabled=false`. Reconnecting sets only
`githubAccessActive=true`, so the administrator must intentionally turn Folio review back on.

### Reconcile through webhooks and the database

The settings page reads persisted state rather than calling GitHub. GitHub's installation webhooks
trigger a full reconciliation against `listReposAccessibleToInstallation`:

1. Fetch and paginate the complete accessible-repository list before opening a transaction.
2. In one transaction, upsert every returned repository as access-active.
3. Mark installation repositories absent from the returned set as disconnected and Folio-disabled.
4. Commit only after all writes succeed.

Both `installation_repositories.added` and `installation_repositories.removed` trigger this flow.
Installation creation, accepted permissions, and unsuspension continue to trigger reconciliation.
Installation suspension or deletion marks every repository belonging to that installation as
disconnected and Folio-disabled without deleting repository or review rows. A deleted GitHub
installation is retained in Folio as an inactive tombstone; the backend must not call the existing
installation delete operation because its cascading foreign key would erase repository history.

A GitHub request failure or incomplete pagination never changes stored access state. This avoids
mistaking an external failure for removal of every repository.

## Architecture

### Database layer

The repository schema gains `github_access_active boolean not null default true`. Repository data
access exposes focused operations to:

- reconcile an installation from a complete set of GitHub repository inputs;
- disconnect all repositories belonging to an installation;
- reject or avoid transitions to Folio-enabled while access is inactive.

The reconciliation transaction preserves `folioEnabled` for repositories that remain connected.
New rows use the existing false default. Rows being reconnected remain off because disconnection
already forced their preference off.

### GitHub application layer

`InstallationSyncFacade` continues to own repository synchronization. It fetches the full GitHub
list, then delegates the transactional reconciliation to the database repository boundary. It must
not hold database locks while waiting on GitHub.

`GitHubWebhookService` handles both added and removed repository events. It also maps installation
suspension and deletion to the disconnect-all operation. The existing best-effort webhook response
behavior remains: side-effect failures are logged without turning an accepted webhook delivery into
a retrying 5xx response.

### Repository settings API

`GET /api/v1/repositories` keeps the common response envelope and returns:

```ts
interface RepositoryListPayload {
  githubInstallationId: number | null;
  repositories: Array<{
    id: string;
    installationId: string;
    githubRepoId: number;
    owner: string;
    name: string;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    folioEnabled: boolean;
    githubAccessActive: boolean;
  }>;
}
```

The GitHub installation ID is the external numeric ID, not Folio's installation UUID. The web app
uses it to form `https://github.com/settings/installations/{id}`. The backend selects the current
non-suspended installation for the workspace account. GitHub permits only one active installation
of an app for a target account; any older deleted installation remains an inactive tombstone and is
not selected. A workspace without a current installation returns `null`.

`PATCH /api/v1/repositories/:id/enabled` retains its existing request body and authorization:

- active workspace owner or administrator;
- `repo_activation` entitlement;
- live GitHub admin permission for the repository.

The backend additionally requires `githubAccessActive=true`. An attempt to enable a disconnected
repository returns a specific common-envelope conflict error. Activation changes continue to be
written to the existing audit log. The backend remains authoritative even if a stale browser renders
an enabled switch.

## User Interface

The existing `/settings/repositories` route and settings sidebar remain. The page uses Folio's dark
tokens and compact sizing while matching the supplied layout:

1. A centered, wider repository card.
2. GitHub icon, `Repositories` title, and description at the upper left.
3. `Manage on GitHub` external link at the upper right.
4. A full-width repository search field.
5. A two-column table: `Repository` and `Folio review`.
6. Compact repository rows with visibility icon, name, access state, and switch.

The management link opens in a new tab with safe external-link attributes. When
`githubInstallationId` is null, the action is disabled and the page explains that the workspace
must connect a GitHub App installation.

The switch uses an accessible `role="switch"`, an explicit accessible name, `aria-checked`, keyboard
activation, and a visible focus state. Green is reserved for the on state. While a mutation is in
flight, the row prevents duplicate submissions. A failed mutation restores the last confirmed state
and renders a short row-level error.

Repositories are filtered immediately from the already-loaded list. Connected repositories appear
first; connected and disconnected groups are each ordered by repository name. Disconnected rows
remain searchable but use muted text, show `Disconnected`, and render a disabled off switch.

The page distinguishes:

- no repositories connected to the installation;
- no repositories matching the search query;
- missing installation metadata;
- insufficient Folio or GitHub authority;
- a repository-setting mutation failure.

The two-column layout remains intact on small screens, with the card and columns contracting rather
than introducing additional automation columns.

## Data Flow

### GitHub access changes

```text
GitHub installation webhook
-> verify and parse delivery
-> fetch complete accessible-repository list
-> transactionally upsert active repositories
-> disconnect absent repositories and force Folio review off
-> settings API exposes persisted result
```

### Administrator changes Folio review

```text
Repository switch
-> PATCH enabled state
-> verify workspace role and entitlement
-> verify live GitHub admin permission
-> lock workspace authority and repository row
-> reject disconnected repository or persist preference
-> write activation audit event
-> return confirmed repository state
```

### Pull request webhook

```text
Pull request opened or changed
-> resolve repository
-> require GitHub access active and Folio review enabled
-> enqueue review job, otherwise log a skip
```

The PR webhook check must include both access and preference state so stale or inconsistent data
fails closed.

## Error Handling

- Preserve the last known repository access state when GitHub listing fails.
- Roll back the complete reconciliation if any database mutation fails.
- Treat disconnected repositories as ineligible for activation and PR processing at every backend
  boundary, not only in the UI.
- Keep GitHub webhook side effects best-effort and observable through structured logs.
- Return all API failures through Folio's common response envelope.
- Keep existing reviews readable when repository activation or GitHub access changes.

## Testing

### Database

- Migration default for existing repositories.
- New repositories default to Folio review off.
- Reconciliation adds, updates, disconnects, and reconnects repositories atomically.
- Disconnection forces Folio review off.
- Reconnection does not restore the previous on preference.
- Disconnect-all affects only the target installation.

### Backend

- Added and removed repository webhooks both trigger full reconciliation.
- Installation suspension and deletion disconnect all associated repositories.
- Installation deletion preserves the installation tombstone, repositories, and review history.
- GitHub list failures leave state unchanged.
- Repository list payload exposes the external GitHub installation ID and access status.
- Workspace scoping prevents cross-workspace repository disclosure and mutation.
- Disconnected repositories cannot be enabled or queued for PR processing.
- Existing role, entitlement, live permission, lock, and audit guarantees remain covered.

### Web

- The table renders the reference layout and dynamic management URL.
- A missing installation ID renders a disabled management action and guidance.
- Search is immediate and case-insensitive.
- Connected repositories sort before disconnected repositories, then by name.
- The switch exposes correct accessible state and disables during submission.
- Disconnected and unauthorized rows show the correct disabled reason.
- Failed mutations restore the confirmed state and show a row-level error.
- Empty-list and empty-search-result states are distinct.

### Full verification

Before implementation is considered complete, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Alternatives Considered

### Fetch GitHub on every settings-page request

This produces fresh data at page load but makes rendering depend on GitHub latency, availability,
and rate limits. It also weakens the persisted state used by webhook processing, so it is rejected.

### Add a manual synchronization button

A manual recovery action can be useful later, but it adds another privileged mutation and UI state.
Webhook reconciliation is sufficient for the first version, so the button is deferred.

### Add multiple automation switches now

Separate controls for open, synchronize, close, badge, and comment behavior would require new policy
semantics and webhook branches before actual usage justifies them. The first version keeps one clear
repository-level review-processing decision.
