import type { DashboardProjectData } from "@/components/dashboard/dashboard-project-desk-model";
import {
  type DashboardClosedRange,
  type DashboardDirection,
  type DashboardBucket,
  type DashboardOpenPullPages,
  type DashboardOpenPullPagesQuery,
  type DashboardOrdering,
  type DashboardPullPage,
  type DashboardPullPageQuery,
  type DashboardRepo,
  fetchDashboardOpenPullPages,
  fetchDashboardPullPage,
} from "@/lib/dashboard-api";

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

export const DASHBOARD_PROJECT_OPEN_LIMIT = 20;
export const DASHBOARD_PROJECT_COMPLETED_LIMIT = 20;

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

export async function loadDashboardProjectBucketPage(
  repo: DashboardRepo,
  bucket: DashboardBucket,
  cursor: string,
  options: DashboardProjectLoadOptions,
  deps: DashboardProjectLoaderDeps = defaultDeps,
): Promise<DashboardPullPage> {
  return deps.fetchPullPage({
    bucket,
    cursor,
    limit:
      bucket === "completed" ? DASHBOARD_PROJECT_COMPLETED_LIMIT : DASHBOARD_PROJECT_OPEN_LIMIT,
    q: options.q,
    ordering: options.ordering,
    direction: options.direction,
    closedRange: bucket === "completed" ? options.closedRange : undefined,
    showDrafts: options.showDrafts,
    repository: repo.fullName,
  });
}
