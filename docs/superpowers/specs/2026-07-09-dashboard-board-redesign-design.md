# Dashboard Board Redesign Design

## Context

Folio's current dashboard is a server-rendered Next.js page backed by
`GET /api/v1/dashboard`. It shows summary metrics, ready/processing PR lists,
and repository access controls. The target dashboard is a dense board of pull
request cards grouped by review relevance, with a fourth column for recently
completed PRs.

The redesign keeps the app dark-mode only and follows the existing design
system: compact spacing, warm near-black surfaces, token-based colors, hairline
borders, and lucide icons.

## Goals

- Replace the dashboard's metric-first layout with a PR-board layout.
- Group open pull requests into `Ready to review`, `Your pull requests`, and
  `Other`.
- Add a `Recently completed` column backed by GitHub merged/closed PR state.
- Preserve the existing dashboard endpoint as the single frontend data source.
- Keep the first implementation server-rendered and visually complete.

## Non-Goals

- Do not implement live client-side search/filtering in the first pass.
- Do not add requested-reviewer or team-review assignment semantics.
- Do not show GitHub labels such as `area:*` or `dependencies` yet.
- Do not move repository enable/disable management into the new dashboard.

## Data Contract

Extend `DashboardPayload` with completed PR data while preserving existing
fields:

```ts
interface DashboardPull {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  headBranch: string;
  baseBranch: string;
  status: DashboardReviewStatus;
  chapterCount: number;
  viewedChapters: number;
  changedFiles: number;
  additions: number;
  deletions: number;
  risk: DashboardRisk;
}

type DashboardCompletedState = "merged" | "closed";

interface DashboardCompletedPull {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  completedAt: string;
  completedState: DashboardCompletedState;
  additions: number;
  deletions: number;
  changedFiles: number;
}

interface DashboardPayload {
  metrics: {
    ready: number;
    processing: number;
    installedRepos: number;
    activeRepos: number;
    completed: number;
  };
  repos: DashboardRepo[];
  pulls: DashboardPull[];
  completedPulls: DashboardCompletedPull[];
  activity: ActivityDay[];
}
```

`completedAt` is a relative display string, matching the existing `updatedAt`
style for open pulls. `completedState` is `merged` when GitHub provides
`merged_at`; otherwise it is `closed`. For merged PRs, completion time is based
on `merged_at`; for closed-without-merge PRs, it is based on `closed_at`.

## Backend Behavior

`DashboardFacade.getForUser` continues to enumerate enabled repositories for
the authenticated user's installations. For each enabled repository it fetches:

- open PRs with `state: "open"` for the existing `pulls` list.
- recently closed PRs with `state: "closed"`, `sort: "updated"`,
  `direction: "desc"`, and `per_page: 20` for completed candidates.

Open PRs are enriched with `pulls.get` detail data so cards can show additions
and deletions. If enrichment fails for one open PR, the existing dashboard item
still renders with zero line counts.

Closed candidates from all repositories are combined, sorted by completion time
descending, and capped to the 20 newest items. The facade enriches those 20
items with `pulls.get` detail data so the UI can show additions, deletions, and
changed file count. If enrichment fails for one completed PR, that card falls
back to zero counts instead of failing the dashboard.

Repository-level GitHub failures remain isolated. A failed open-PR fetch should
not prevent completed PRs for other repositories from rendering, and a failed
closed-PR fetch should not prevent open PRs from rendering.

## Frontend Behavior

The dashboard remains a server component at `apps/web/src/app/page.tsx`.
It fetches the expanded payload and classifies open PRs using the authenticated
user login:

- `Your pull requests`: `pull.author === user.login`.
- `Ready to review`: `pull.author !== user.login && pull.status === "ready"`.
- `Other`: every remaining open PR.
- `Recently completed`: `data.completedPulls`.

The page replaces the metric/repository layout with:

- a compact welcome heading,
- a full-width search bar and filter/sort icon buttons,
- a responsive four-column board,
- PR cards optimized for scan speed.

The search bar and icon controls are presentational in this phase. They should
not imply working filtering behavior through hidden state or partial client
logic.

## Components

Split dashboard UI into dedicated components so `page.tsx` does not become a
large mixed-concern file:

- `DashboardBoard`: responsive column layout and board-level spacing.
- `DashboardColumn`: title, count, empty state, and card list.
- `OpenPullCard`: open PR card with repo/number, readiness icon, title, size
  pill, author, additions, and deletions.
- `CompletedPullCard`: completed PR card with merged/closed icon, completion
  time, title, size pill, author, additions, and deletions.
- `DashboardSearchBar`: presentational search input and filter/sort buttons.

Size pills are derived from changed files plus line churn. The first pass only
needs `size/XS`, `size/S`, `size/M`, `size/L`, and `size/XXL` style categories
based on available numeric data.

## Layout And Styling

Use existing tokens and primitives only:

- `bg-background`, `bg-card`, `bg-muted`, `border`, `text-muted-foreground`,
  `text-primary`, `text-destructive`, `text-warning`, and `text-info`.
- lucide icons at compact sizes.
- card radius no larger than the design system defaults.
- no new raw OKLCH or hex colors inside components.

Responsive behavior:

- mobile: one column stacked vertically,
- tablet: two columns,
- desktop: four columns.

The completed column can be long, but the first implementation should rely on
the backend's 20-item cap and normal page scrolling rather than nested scroll
regions.

## Testing

Backend tests in `dashboard.facade.test.ts` should cover:

- open PRs still populate `pulls`;
- `merged_at` maps to `completedState: "merged"`;
- missing `merged_at` maps to `completedState: "closed"`;
- completed PRs from multiple repositories are sorted newest first and capped at
  20;
- closed-list and detail-fetch failures do not fail the whole dashboard.

Frontend tests in `page.test.ts` should cover source-level contract checks for
the redesigned dashboard:

- repository-access-centric UI is no longer the dashboard focus;
- dashboard board and card components are used;
- completed PR rendering is part of the page contract.

Expected verification commands:

```bash
pnpm --filter @folio/backend test -- dashboard.facade
pnpm --filter @folio/web test -- page
pnpm lint
pnpm typecheck
```

## Risks

- GitHub API call volume increases because enabled repositories now fetch closed
  PRs and enrich up to 20 completed PRs. The cap keeps the first pass bounded.
- Completed PR line counts require detail enrichment. Fallback counts avoid UI
  failure but may temporarily show `0` if GitHub detail calls fail.
- Presentational search/filter controls can look interactive. The implementation
  must keep them visually subtle or disabled until real filtering is added.
