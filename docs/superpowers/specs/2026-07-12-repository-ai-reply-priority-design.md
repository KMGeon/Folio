# Repository AI Reply and Priority Settings Design

## Summary

Extend each repository's existing `Folio review` setting with two independent
repository-level preferences:

- `AI reply enabled` controls whether Folio publishes its automatic chapter-summary
  comment to the GitHub pull request.
- `Priority` (`high`, `normal`, `low`) determines the repository order on the
  dashboard.

`Folio review` remains the activation switch: it controls whether a repository
is included on the dashboard and receives review processing. Disabling AI
replies never disables PR reading, decomposition, persistence, or the Folio
review UI.

## Goals

- Keep the existing activation behavior unchanged.
- Let administrators suppress automatic GitHub bot comments per repository.
- Let administrators make important repositories appear first in the dashboard.
- Persist both settings so web workers and every browser session apply the same
  policy.

## Non-goals

- Blocking a reviewer from creating a manual inline GitHub comment.
- Removing or changing comments Folio already published.
- Reordering PRs within an individual repository's desk.
- Adding per-PR, per-branch, or per-event automation policies.

## Data Model

Add two non-null columns to `repositories`:

```txt
ai_reply_enabled boolean not null default true
priority         text not null default 'normal'
```

`priority` is constrained to `high`, `normal`, and `low`. Defaults preserve the
current behavior: installed repositories continue to receive automatic chapter
comments while their dashboard order remains neutral.

GitHub installation reconciliation must preserve these user-managed preferences
when it upserts an existing repository. A disconnected repository remains
Folio-disabled under the existing rules, while its AI-reply and priority values
are retained for a later reconnection.

The shared `Repository` schema and all API-facing repository representations
expose `aiReplyEnabled` and `priority`.

## API and Authorization

Keep the existing endpoint unchanged:

```txt
PATCH /api/v1/repositories/:id/enabled
```

Add a focused settings mutation:

```txt
PATCH /api/v1/repositories/:id/settings
```

The request accepts one or both fields:

```json
{ "aiReplyEnabled": false, "priority": "high" }
```

At least one field is required. The endpoint returns the complete confirmed
repository representation in Folio's common response envelope.

It uses the same authorization boundary as activation: an active workspace
administrator with the repository-activation entitlement and current GitHub
administrator permission. It locks and revalidates the workspace authority and
repository row before mutation, writes a repository-settings audit event, and
rejects disconnected rows. This keeps stale settings pages from changing a
repository that no longer belongs to the current accessible workspace.

## Automatic GitHub Comment Policy

`ReviewPullFacade` continues to fetch the PR, decompose its diff, and persist
the resulting Folio review for every enabled repository. Before it builds or
upserts the marked `chapters` GitHub comment, it reads the repository setting:

- When `aiReplyEnabled=true`, preserve the current upsert behavior.
- When `aiReplyEnabled=false`, skip the GitHub comment API call and return a
  successful review result with no comment URL or comment error.

The setting applies at execution time, not only when a webhook job is enqueued,
so an administrator can turn it off while a queued job waits for a worker. The
existing manual inline-comment endpoint is intentionally unaffected.

## Dashboard Priority Policy

Dashboard summary data includes each enabled repository's priority. The web
client sorts enabled projects in this exact order:

1. `high`
2. `normal`
3. `low`
4. `fullName` ascending as a stable tie-breaker

The sorted collection feeds both the Projects sidebar and the All projects
project-desk sections. A selected repository remains selected after refresh;
priority only changes how projects are listed, not queue status order, PR order
within a project, or counts.

## Settings UI

The existing dense, dark Repositories table gains two compact columns after
`Folio review`:

| Column | Control | Meaning |
| --- | --- | --- |
| Folio review | Switch | Includes the repository in dashboard and review processing. |
| AI 답글 | Switch | Publishes Folio's automatic chapter-summary GitHub comment. |
| 우선순위 | Compact select | Places the repository high, normal, or low in the dashboard project order. |

The AI-reply switch is enabled by default for new and existing repositories.
The priority control defaults to `보통`. While a row has any in-flight mutation,
all three controls in that row are disabled to prevent responses arriving out of
order. Existing disconnected and authorization-disabled states also disable all
controls and reuse the current row-level explanation.

The table preserves the design system's compact control sizes, dark tokens, and
accessible labels. Settings changes update only the confirmed server response;
there is no optimistic state that can survive a failed request.

## Error Handling

- Invalid or empty settings bodies return a bad-request common-envelope error.
- A stale/disconnected repository returns the existing repository-disconnected
  failure and does not mutate either preference.
- A failure to write the automatic GitHub comment remains non-fatal when replies
  are enabled, as it is today.
- When replies are disabled, no comment-write attempt is made, so a skipped
  comment cannot be reported as an error.
- Existing Folio reviews and existing GitHub comments are never deleted when a
  setting changes.

## Testing

### Database and shared types

- Migration defaults existing rows to `aiReplyEnabled=true` and `priority=normal`.
- Repository updates change only requested settings and preserve the other
  setting.
- Installation sync retains both settings for existing repositories.
- The shared schema accepts only the three priority values.

### Backend

- Repository list and dashboard summary return both settings as appropriate.
- Settings mutation validates the patch, workspace scope, entitlement, live
  GitHub permission, locked authority, and disconnected state.
- Settings audit data records the before and after values.
- An enabled repository with replies disabled persists its review but performs
  no marked-comment upsert.
- An enabled repository with replies enabled retains the existing comment path.
- A setting changed after enqueue is honored when the review worker executes.

### Web

- The table renders all three settings with correct accessible labels and values.
- A confirmed API response updates just that repository row.
- Pending, unauthorized, and disconnected states disable every row control.
- Project sorting puts high before normal before low, with full repository name
  as the tie-breaker.
- Both the sidebar and All projects sections use the sorted project collection.

### Full verification

Before completion, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Alternatives Considered

### Browser-only preferences

This would not reach the worker that writes GitHub comments and would make
dashboard order differ across users, so it is rejected.

### Make AI replies part of the Folio-review switch

This would force users to choose between viewing a PR in Folio and suppressing
automatic GitHub comments. The two behaviors are intentionally independent.

### One endpoint that replaces all repository configuration

Replacing the entire configuration risks overwriting a concurrent activation
change. A partial settings endpoint retains the established activation contract
and updates only the fields an administrator changed.
