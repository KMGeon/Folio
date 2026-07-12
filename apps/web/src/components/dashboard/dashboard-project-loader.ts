import type { DashboardProjectData } from "@/components/dashboard/dashboard-project-desk-model";
import {
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
    limit: 3,
    q: options.q,
    ordering: options.ordering,
    direction: options.direction,
    showDrafts: options.showDrafts,
    repository: repo.fullName,
  } as const;
  const [open, completed] = await Promise.all([
    deps.fetchOpenPages(baseQuery),
    deps.fetchPullPage({
      ...baseQuery,
      bucket: "completed",
      closedRange: options.closedRange,
    }),
  ]);
  return {
    repo,
    pages: { ...open, completed },
    isLoading: false,
    error: null,
  };
}
