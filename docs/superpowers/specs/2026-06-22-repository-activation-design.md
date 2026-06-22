# Repository Activation Design

## Goal

Folio should let a user install the GitHub App broadly while deciding, inside
Folio, which repositories are active. A repository that is installed but inactive
is visible as available, but Folio does not process its pull requests.

The default for newly discovered repositories is inactive. This avoids unexpected
decomposition work, token usage, PR comments, and dashboard noise when a user
grants the GitHub App access to all repositories.

## Current Context

Folio already stores GitHub App installations and repositories:

- `installations` records GitHub App installation accounts.
- `repositories` records repositories accessible to each installation.
- `InstallationSyncFacade` syncs accessible repositories from GitHub.
- `DashboardFacade` lists open PRs across installed repositories.
- `GitHubWebhookService` enqueues review jobs for reviewable `pull_request`
  webhook actions.

The feature should extend those existing boundaries rather than adding a new
"project" concept.

## Data Model

Add a boolean column to `repositories`:

```txt
folio_enabled boolean not null default false
```

Repository sync should preserve the existing value when a repository already
exists. New repositories should be inserted with `folio_enabled=false`.

The API-facing repository type should expose the enabled state so the web app can
render controls and counts without deriving state elsewhere.

## Backend API

Add repository management endpoints under the existing authenticated API:

```txt
GET   /api/v1/repositories
PATCH /api/v1/repositories/:id/enabled
```

`GET /api/v1/repositories` returns the repositories installed for the current
user's GitHub account, including:

- `id`
- `fullName`
- `owner`
- `name`
- `private`
- `defaultBranch`
- `folioEnabled`

`PATCH /api/v1/repositories/:id/enabled` accepts:

```json
{ "enabled": true }
```

The endpoint should only update repositories that belong to an installation for
the current user. It returns the updated repository through the common API
response envelope.

## Processing Rules

Dashboard pull-request listing should only fetch and show open PRs from enabled
repositories. The dashboard repository access section should show all installed
repositories so the user can turn inactive repositories on.

Webhook processing should check repository activation before enqueueing a review
job. For reviewable `pull_request` actions, if the repository is inactive,
Folio should acknowledge the webhook, log that the repo is disabled, and skip
enqueueing decomposition work.

When a user enables a repository, Folio starts processing future matching
webhooks for that repository. Backfilling already-open PRs is out of scope for
the first implementation. A later feature can add an explicit "sync open PRs"
action if users need retroactive processing.

## Frontend

The dashboard keeps the current dense review-focused structure.

In `Repository Access`, each installed repository should show:

- repository full name
- enabled/inactive state
- open PR count for enabled repos when available
- a compact toggle

Add or complete a settings repository management screen at `/settings` with:

- installed repository list
- search by owner/name/full name
- enabled/disabled filter
- per-repository toggle
- summary counts for active and inactive repositories

Toggling should use a server action or form submission with revalidation for the
first version. Optimistic client updates can be added later if the settings
surface moves to a client-side state model.

## Errors And Edge Cases

If a repository is no longer accessible from GitHub, sync may stop returning it.
The first version can leave stale rows in place unless existing sync behavior
already deletes them.

If GitHub token creation fails for an installation, repository management should
still show database-known repositories where possible. Dashboard PR fetching can
continue to skip unreachable installations as it does now.

If a disabled repository receives a webhook, the API still returns success to
GitHub. Disabled state is a product decision, not a webhook delivery failure.

## Testing

Backend tests should cover:

- new repositories default to inactive
- repository sync preserves enabled state on upsert
- repository list is scoped to the current user's installations
- repository toggle rejects repositories outside the current user's scope
- webhook does not enqueue review jobs for inactive repositories
- dashboard PR fetching skips inactive repositories

Frontend tests should cover:

- dashboard renders enabled/inactive repository state
- settings list can filter repositories by enabled state
- toggle requests the repository enabled endpoint

Database tests should cover the migration default and repository update
behavior.

## Non-Goals

This design does not change GitHub App installation scope in GitHub. Users can
still choose all repositories or selected repositories during installation.

This design does not add branch-level rules, model selection, auto-comment
settings, or retroactive open PR backfill. Those can be added later on top of the
same repository settings surface.
