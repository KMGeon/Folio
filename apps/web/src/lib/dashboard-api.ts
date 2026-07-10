import { apiRequest } from "./api-client";

export type DashboardReviewStatus = "ready" | "processing";
export type DashboardRisk = "low" | "medium" | "high";

export interface DashboardPull {
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

export type DashboardCompletedState = "merged" | "closed";

export interface DashboardCompletedPull {
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

export type DashboardBucket = "ready" | "yours" | "other" | "completed";
export type DashboardOrdering = "updated" | "lines";
export type DashboardDirection = "desc" | "asc";
export type DashboardClosedRange = "all" | "1d" | "7d" | "30d" | "90d";
export type DashboardLayoutMode = "board" | "list";
export type DashboardGrouping = "responsibility" | "repository";
export type DashboardCardProperty =
  | "Repository"
  | "ID"
  | "Author"
  | "Labels"
  | "Reviewers"
  | "Lines changed"
  | "CI status"
  | "Comments"
  | "Chapters"
  | "Preview environments"
  | "Updated date";

export interface DashboardRepo {
  id: string;
  fullName: string;
  openPrCount: number;
  folioEnabled: boolean;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface DashboardPayload {
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

export interface DashboardSummaryPayload {
  metrics: DashboardPayload["metrics"];
  repos: DashboardRepo[];
  activity: ActivityDay[];
}

export interface DashboardPullPage {
  items: (DashboardPull | DashboardCompletedPull)[];
  nextCursor: string | null;
  count: number;
}

export type DashboardOpenBucket = Exclude<DashboardBucket, "completed">;
export type DashboardOpenPullPages = Record<DashboardOpenBucket, DashboardPullPage>;

export interface DashboardPullPageQuery {
  bucket: DashboardBucket;
  limit?: number;
  cursor?: string | null;
  q?: string;
  ordering?: DashboardOrdering;
  direction?: DashboardDirection;
  closedRange?: DashboardClosedRange;
  showDrafts?: boolean;
}

export type DashboardOpenPullPagesQuery = Omit<
  DashboardPullPageQuery,
  "bucket" | "cursor" | "closedRange"
>;

export interface FetchDashboardOptions {
  /** Forwarded `Cookie` header so server-component fetches carry the session. */
  cookie?: string;
}

export function fetchDashboard(opts?: FetchDashboardOptions): Promise<DashboardPayload> {
  return opts?.cookie
    ? apiRequest<DashboardPayload>("/api/v1/dashboard", { headers: { cookie: opts.cookie } })
    : apiRequest<DashboardPayload>("/api/v1/dashboard");
}

export function fetchDashboardSummary(
  opts?: FetchDashboardOptions,
): Promise<DashboardSummaryPayload> {
  return opts?.cookie
    ? apiRequest<DashboardSummaryPayload>("/api/v1/dashboard/summary", {
        headers: { cookie: opts.cookie },
      })
    : apiRequest<DashboardSummaryPayload>("/api/v1/dashboard/summary");
}

export function fetchDashboardPullPage(query: DashboardPullPageQuery): Promise<DashboardPullPage> {
  return apiRequest<DashboardPullPage>(dashboardPullPagePath(query));
}

export function fetchDashboardOpenPullPages(
  query: DashboardOpenPullPagesQuery,
): Promise<DashboardOpenPullPages> {
  return apiRequest<DashboardOpenPullPages>(dashboardOpenPullPagesPath(query));
}

export function dashboardOpenPullPagesPath(query: DashboardOpenPullPagesQuery): string {
  const params = new URLSearchParams();
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.ordering) {
    params.set("ordering", query.ordering);
  }
  if (query.direction) {
    params.set("direction", query.direction);
  }
  if (typeof query.showDrafts === "boolean") {
    params.set("showDrafts", String(query.showDrafts));
  }
  return `/api/v1/dashboard/pulls/open?${params.toString()}`;
}

export function dashboardPullPagePath(query: DashboardPullPageQuery): string {
  const params = new URLSearchParams();
  params.set("bucket", query.bucket);
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.ordering) {
    params.set("ordering", query.ordering);
  }
  if (query.direction) {
    params.set("direction", query.direction);
  }
  if (query.closedRange) {
    params.set("closedRange", query.closedRange);
  }
  if (typeof query.showDrafts === "boolean") {
    params.set("showDrafts", String(query.showDrafts));
  }
  return `/api/v1/dashboard/pulls?${params.toString()}`;
}
