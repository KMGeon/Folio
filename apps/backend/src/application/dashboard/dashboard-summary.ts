import { installationsRepo, repositoriesRepo } from "@folio/db";
import { fetchPublicContributions } from "../../infrastructure/github/github-contributions.js";
import type { DashboardRepo } from "./dashboard.facade.js";
import type { DashboardSummaryPayload } from "./dashboard-pull-page-types.js";

export async function getDashboardSummaryForUser(user: {
  id: string;
  login: string;
}): Promise<DashboardSummaryPayload> {
  const installations = await installationsRepo.listByAccountLogin(user.login);
  const repos: DashboardRepo[] = [];

  for (const installation of installations) {
    for (const repo of await repositoriesRepo.listByInstallation(installation.id)) {
      repos.push({
        id: repo.id,
        fullName: repo.fullName,
        openPrCount: 0,
        folioEnabled: repo.folioEnabled,
      });
    }
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
