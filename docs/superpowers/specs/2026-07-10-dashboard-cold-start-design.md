# Dashboard Cold-Start Design

## Goal

Reduce the dashboard's first-load latency without relying on a warm in-memory cache. Preserve the
existing board layout, filters, per-column pagination, and current bucket endpoints.

## Current Bottlenecks

The client starts four bucket requests on mount. The `ready`, `yours`, and `other` requests each
list the same open pull requests and resolve the same database-backed review status before applying
their bucket filter. The `limit` is applied only after this full scan.

Pull detail enrichment is also sequential. A cold `completed` page with 20 cards waits for 20
GitHub pull-detail requests one after another. The existing process-local cache makes later loads
faster, but it does not improve a deployment or process restart's first request.

## Chosen Approach

Add a combined open-board endpoint for initial and filter-reset loads, while retaining the existing
bucket endpoint for compatibility and per-column pagination. Enrich visible pull cards with a
bounded-concurrency detail loader shared by open and completed pages.

The alternatives considered were request coalescing across the existing four HTTP requests and a
webhook-maintained database projection. Cross-request coalescing adds lifecycle complexity while
still repeating application work, and a full projection is a larger architectural change than this
cold-start fix. A projection remains the preferred longer-term direction if dashboard scale grows.

## API Contract

Add:

```http
GET /api/v1/dashboard/pulls/open?limit=20&q=&ordering=updated&direction=desc&showDrafts=true
```

The response data uses the common API envelope and has this shape:

```ts
interface DashboardOpenPullPages {
  ready: DashboardPullPage;
  yours: DashboardPullPage;
  other: DashboardPullPage;
}
```

Each page retains `items`, `count`, and `nextCursor`. Its cursor is compatible with the existing
`GET /api/v1/dashboard/pulls?bucket=...` endpoint, so later IntersectionObserver loads can continue
through the current endpoint independently for each column.

The combined endpoint accepts the open-board query fields used by the client: `limit`, `q`,
`ordering`, `direction`, and `showDrafts`. `closedRange` remains specific to the completed endpoint.
The existing bucket endpoint remains unchanged.

## Backend Data Flow

For a combined open request:

1. Authenticate through the existing session guard.
2. Load the user's installations and enabled repositories.
3. Mint one Octokit client per installation.
4. List each repository's open pull requests with the existing repository concurrency limit.
5. Resolve each matching pull request's review status exactly once.
6. Partition the resulting candidates into `ready`, `yours`, and `other`.
7. Sort and slice the first page for each partition.
8. Enrich only the selected cards with pull details, using a global concurrency limit of five.
9. Return all three pages together.

The current bucket classification rules remain authoritative:

- `yours`: authored by the current user.
- `ready`: authored by someone else and backed by a completed Folio chapter revision.
- `other`: authored by someone else and not ready.

Repository failures remain isolated. An unreachable installation or repository contributes no
candidates, while reachable repositories still appear in the response.

## Bounded Pull-Detail Enrichment

Create a focused batch function in `dashboard-pull-details.ts` that accepts pull-detail requests,
loads at most five at once, and returns results in input order. Both open and completed page builders
use it. Individual GitHub detail failures retain the existing zero-count fallback.

The limit of five avoids the current 20-request serial latency without creating an unbounded burst
against GitHub or the backend's outbound connection pool. Cache use remains an implementation detail;
correctness and acceptable cold-start behavior must not depend on cache hits.

## Frontend Data Flow

On initial mount and whenever search, ordering, direction, or draft visibility resets the board:

- Start one combined open request and one completed request in parallel.
- Populate the three open columns from the combined response.
- Populate completed independently.
- Continue later per-column pagination through the existing bucket endpoint.

If the combined open request fails, all three open columns show their existing retry state while the
completed column can still succeed. If completed fails, the open board remains usable. Request
version checks continue to prevent stale filter responses from replacing newer state.

## Success Criteria

- A combined initial request resolves database review status once per open PR, not once per open
  bucket.
- A 20-card page never runs more than five GitHub detail requests concurrently and runs more than
  one request concurrently when multiple cards exist.
- The initial client reset starts two API requests instead of four: combined open and completed.
- Existing bucket URLs and cursor pagination continue to work.
- The visible dashboard structure and card data remain unchanged.
- Repository-level and pull-detail failures preserve partial results and existing fallbacks.

## Testing

- Backend facade test: combined open pages classify pulls correctly and call status resolution once
  per open pull.
- Pull-detail batch test: deferred GitHub calls prove overlap, preserve input order, and enforce the
  concurrency ceiling of five.
- Controller test: the new route validates query values and uses the common response envelope.
- Frontend tests: the combined open URL is serialized correctly and an initial/reset load maps all
  three open pages while completed remains independent.
- Regression verification: dashboard backend/frontend tests, lint, typecheck, test, and build.
