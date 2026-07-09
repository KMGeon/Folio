import type { Octokit } from "octokit";
import type {
  ActivityDay,
  DashboardCompletedPull,
  DashboardCompletedState,
  DashboardPayload,
  DashboardPull,
  DashboardRepo,
} from "./dashboard.facade.js";

export type DashboardBucket = "ready" | "yours" | "other" | "completed";
export type DashboardOrdering = "updated" | "lines";
export type DashboardDirection = "desc" | "asc";
export type DashboardClosedRange = "all" | "1d" | "7d" | "30d" | "90d";

export interface DashboardSummaryPayload {
  metrics: DashboardPayload["metrics"];
  repos: DashboardRepo[];
  activity: ActivityDay[];
}

export interface DashboardPullPageQuery {
  bucket: DashboardBucket;
  limit?: number;
  cursor?: string;
  q?: string;
  ordering?: DashboardOrdering;
  direction?: DashboardDirection;
  closedRange?: DashboardClosedRange;
  showDrafts?: boolean;
}

export interface DashboardPullPage {
  items: (DashboardPull | DashboardCompletedPull)[];
  nextCursor: string | null;
  count: number;
}

export type GitHubPullSummary = Record<"title" | "updated_at", string> & {
  number: number;
  user?: { login?: string } | null;
  head: { ref: string };
  base: { ref: string };
  draft?: boolean;
  closed_at?: string | null;
  merged_at?: string | null;
};

export type CompletedCandidate = Record<
  "owner" | "repo" | "title" | "author" | "completedIso",
  string
> & {
  octokit: Octokit;
  number: number;
  completedState: DashboardCompletedState;
};
