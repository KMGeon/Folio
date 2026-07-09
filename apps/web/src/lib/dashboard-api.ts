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

export interface FetchDashboardOptions {
  /** Forwarded `Cookie` header so server-component fetches carry the session. */
  cookie?: string;
}

export function fetchDashboard(opts?: FetchDashboardOptions): Promise<DashboardPayload> {
  return opts?.cookie
    ? apiRequest<DashboardPayload>("/api/v1/dashboard", { headers: { cookie: opts.cookie } })
    : apiRequest<DashboardPayload>("/api/v1/dashboard");
}
