import { createInstallationOctokit } from "./client.js";
import type { GitHubConfig } from "./config.js";

/**
 * Public install URL for the App. W2's "Install Folio" flow links here; the user
 * picks repos and GitHub redirects back with an `installation_id`.
 */
export function getInstallationUrl(cfg: Pick<GitHubConfig, "appSlug">): string {
  return `https://github.com/apps/${cfg.appSlug}/installations/new`;
}

/**
 * List the repositories an installation can access (for I1 routing / W2 UI).
 * Paginates the installation-token endpoint. Read-tolerant: returns [] on error.
 */
export async function listInstallationRepos(
  installationId: number,
): Promise<{ owner: string; repo: string }[]> {
  try {
    const client = await createInstallationOctokit(installationId);
    const repos = await client.paginate(client.rest.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    });
    return repos.map((r) => ({ owner: r.owner.login, repo: r.name }));
  } catch {
    return [];
  }
}
