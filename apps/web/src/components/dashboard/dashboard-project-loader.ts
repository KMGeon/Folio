import type { DashboardProjectData } from "@/components/dashboard/dashboard-project-desk-model";
import {
  type DashboardBucket,
  type DashboardClosedRange,
  type DashboardDirection,
  type DashboardOpenPullPages,
  type DashboardOpenPullPagesQuery,
  type DashboardOrdering,
  type DashboardPullPage,
  type DashboardPullPageQuery,
  type DashboardRepo,
  fetchDashboardOpenPullPages,
  fetchDashboardPullPage,
} from "@/lib/dashboard-api";

/** Initial open-page size for cockpit classification (board uses 20). */
export const DASHBOARD_PROJECT_OPEN_LIMIT = 20;
/**
 * Complete is the full-width history list now — not a 3-item “recent” preview.
 * Keep page size aligned with the board so infinite scroll has a usable cursor.
 */
export const DASHBOARD_PROJECT_COMPLETED_LIMIT = 20;

export interface DashboardProjectLoadOptions {
  q?: string;
  ordering: DashboardOrdering;
  direction: DashboardDirection;
  closedRange: DashboardClosedRange;
  showDrafts: boolean;
}

export interface DashboardProjectLoaderDeps {
  fetchOpenPages: (query: DashboardOpenPullPagesQuery) => Promise<DashboardOpenPullPages>;
  fetchPullPage: (query: DashboardPullPageQuery) => Promise<DashboardPullPage>;
}

const defaultDeps: DashboardProjectLoaderDeps = {
  fetchOpenPages: fetchDashboardOpenPullPages,
  fetchPullPage: fetchDashboardPullPage,
};

export async function loadDashboardProjectData(
  repo: DashboardRepo,
  options: DashboardProjectLoadOptions,
  deps: DashboardProjectLoaderDeps = defaultDeps,
): Promise<DashboardProjectData> {
  const baseQuery = {
    q: options.q,
    ordering: options.ordering,
    direction: options.direction,
    showDrafts: options.showDrafts,
    repository: repo.fullName,
  } as const;
  const [open, completed] = await Promise.all([
    deps.fetchOpenPages({ ...baseQuery, limit: DASHBOARD_PROJECT_OPEN_LIMIT }),
    deps.fetchPullPage({
      ...baseQuery,
      bucket: "completed",
      closedRange: options.closedRange,
      limit: DASHBOARD_PROJECT_COMPLETED_LIMIT,
    }),
  ]);
  return {
    repo,
    pages: { ...open, completed },
    isLoading: false,
    error: null,
  };
}

/** Next page for one project bucket (used by cockpit infinite scroll). */
export async function loadDashboardProjectBucketPage(
  repo: DashboardRepo,
  options: DashboardProjectLoadOptions & {
    bucket: DashboardBucket;
    cursor: string;
    limit?: number;
  },
  deps: DashboardProjectLoaderDeps = defaultDeps,
): Promise<DashboardPullPage> {
  const limit =
    options.limit ??
    (options.bucket === "completed"
      ? DASHBOARD_PROJECT_COMPLETED_LIMIT
      : DASHBOARD_PROJECT_OPEN_LIMIT);
  return deps.fetchPullPage({
    bucket: options.bucket,
    limit,
    cursor: options.cursor,
    q: options.q,
    ordering: options.ordering,
    direction: options.direction,
    closedRange: options.bucket === "completed" ? options.closedRange : undefined,
    showDrafts: options.showDrafts,
    repository: repo.fullName,
  });
}
