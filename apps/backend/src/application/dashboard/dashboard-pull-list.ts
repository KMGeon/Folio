import type { Octokit } from "octokit";
import {
  DASHBOARD_CLOSED_PULL_LIST_TTL_MS,
  DASHBOARD_OPEN_PULL_LIST_TTL_MS,
  cachedDashboardGithubRequest,
} from "./dashboard-github-cache.js";
import { COMPLETED_PULL_LIMIT } from "./dashboard-completed-pull-window.js";
import type { DashboardDirection, GitHubPullSummary } from "./dashboard-pull-page-types.js";

export async function listDashboardPulls(
  octokit: Octokit,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all",
  page?: number,
  direction?: DashboardDirection,
): Promise<GitHubPullSummary[]> {
  if (state === "all") {
    const [open, closed] = await Promise.all([
      page && page > 1
        ? Promise.resolve([])
        : listDashboardPulls(octokit, owner, repo, "open").catch(() => []),
      listDashboardPulls(octokit, owner, repo, "closed", page, direction).catch(() => []),
    ]);
    return [...new Map([...open, ...closed].map((pull) => [pull.number, pull])).values()];
  }
  const cacheKey = `pulls:list:${owner}/${repo}:${state}:${page ?? 1}:${direction ?? "desc"}`;
  const ttlMs =
    state === "open" ? DASHBOARD_OPEN_PULL_LIST_TTL_MS : DASHBOARD_CLOSED_PULL_LIST_TTL_MS;
  return cachedDashboardGithubRequest(cacheKey, ttlMs, async () => {
    if (state === "closed") {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state,
        sort: "updated",
        direction: direction ?? "desc",
        per_page: COMPLETED_PULL_LIMIT,
        ...(page ? { page } : {}),
      });
      return data as GitHubPullSummary[];
    }
    return (await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state,
      per_page: 100,
    })) as GitHubPullSummary[];
  });
}
