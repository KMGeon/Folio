# Global PR Search Design

## Problem

The global search modal is labeled as a PR and repository search, but its initial
results are static application routes. Open PRs are appended only after the full
dashboard request finishes. When there are no open PRs, or while that request is
pending, the control behaves like a page command menu instead of PR search.

## Desired Behavior

- Opening global search shows the most recently updated open pull requests.
- Static page routes are not search results.
- Entering a query searches open pull requests by the matching behavior already
  provided by the dashboard open-pulls API: repository name, PR number, title,
  or author login, using case-insensitive substring matching.
- Selecting a result opens the first review chapter for that pull request.
- Existing modal accessibility remains intact: initial input focus, Escape to
  close, trapped Tab navigation, backdrop dismissal, and focus restoration.

Recently opened means open pull requests ordered by their latest update time. It
does not include merged or closed pull requests.

The dashboard response keeps the human-readable `updatedAt` label for cards and
adds `updatedAtIso`, copied from GitHub's `updated_at`, for exact machine ordering.

## Data Flow

`AppSearch` will reuse `fetchDashboardOpenPullPages`, requesting the `ready`,
`yours`, and `other` buckets together. Results will be merged, deduplicated by PR
identity, sorted by `Date.parse(updatedAtIso)` descending, and capped at 10 results.
Sorting happens after bucket merging so rounded labels such as `방금` cannot
distort the global top-10 cutoff.

Opening the modal triggers an unfiltered request for recent open PRs. Changing
the query triggers a short debounced request with `q`. A stale request must not
replace results for a newer query.

## Search States

- Loading: show a compact loading message instead of stale page routes.
- Results: show PR identity, title, and repository context.
- Empty: distinguish that no open PRs match the current query.
- Error: show a retryable search error rather than swallowing the request.

The existing dark modal, tokens, spacing, and navigation rail interaction remain
unchanged.

## Affected Files

- `apps/backend/src/application/dashboard/dashboard.facade.ts` and its facade test
  expose the exact timestamp on the legacy dashboard payload.
- `apps/backend/src/application/dashboard/dashboard-pull-page.ts` and the combined
  open-page test expose the same timestamp on paged responses.
- `apps/web/src/lib/dashboard-api.ts` declares `DashboardPull.updatedAtIso`.
- `apps/web/src/components/app-search.tsx` and its component test use the exact
  timestamp for global ordering and cutoff behavior.

## Testing

Component tests will verify that:

1. Opening search requests recently updated open PRs and renders them in recency
   order without application-page entries.
2. Pulls from different buckets with identical display labels are globally ordered
   and capped using `updatedAtIso`.
3. Typing a query sends the debounced query to the open-pulls API and renders the
   matching result.
4. A selected result navigates to its first review chapter.
5. Loading, filtered-empty, unfiltered-empty, and error states are visible.
6. Existing keyboard focus, Escape, Tab trapping, and backdrop behavior continue
   to pass.

Implementation follows test-driven development: add the smallest failing
behavioral test, confirm the expected failure, implement the minimal fix, and
then run the focused web tests followed by repository verification.
