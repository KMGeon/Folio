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
  risk: DashboardRisk;
}

export interface DashboardRepo {
  fullName: string;
  openPrCount: number;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface DashboardPayload {
  metrics: { ready: number; processing: number; installedRepos: number };
  repos: DashboardRepo[];
  pulls: DashboardPull[];
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
