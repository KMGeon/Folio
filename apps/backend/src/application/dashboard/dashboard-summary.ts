import { fetchPublicContributions } from "../../infrastructure/github/github-contributions.js";
import type { DashboardRepo } from "./dashboard.facade.js";
import type { DashboardSummaryPayload } from "./dashboard-pull-page-types.js";
import type { DashboardWorkspaceScope } from "./dashboard-workspace-scope.js";

export async function getDashboardSummaryForUser(
  user: {
    id: string;
    login: string;
  },
  scope: DashboardWorkspaceScope | null,
): Promise<DashboardSummaryPayload> {
  const repos: DashboardRepo[] = [];

  for (const repo of scope?.repositories ?? []) {
    repos.push({
      id: repo.id,
      fullName: repo.fullName,
      openPrCount: 0,
      folioEnabled: repo.folioEnabled,
    });
  }

  const activity = await fetchPublicContributions(user.login);
  return {
    metrics: {
      ready: 0,
      processing: 0,
      installedRepos: repos.length,
      activeRepos: repos.filter((repo) => repo.folioEnabled).length,
      completed: 0,
    },
    repos,
    activity,
  };
}
