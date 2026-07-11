import { ACCOUNT_TYPE, type AccountType } from "@folio/types";
import { createAppOctokit, createInstallationOctokit } from "./client.js";
import type { GitHubConfig } from "./config.js";

export interface InstallationAccountIdentity {
  githubAccountId: number;
  accountLogin: string;
  accountType: AccountType;
}

/**
 * Public install URL for the App. W2's "Install Folio" flow links here; the user
 * picks repos and GitHub redirects back with an `installation_id`.
 */
export function getInstallationUrl(cfg: Pick<GitHubConfig, "appSlug">): string {
  return `https://github.com/apps/${cfg.appSlug}/installations/new`;
}

/** Resolve claim identity with app credentials so no client-provided account fields are trusted. */
export async function getInstallationAccount(
  installationId: number,
): Promise<InstallationAccountIdentity> {
  const { data } = await createAppOctokit().rest.apps.getInstallation({
    installation_id: installationId,
  });
  const account = data.account;
  if (
    !account ||
    !("login" in account) ||
    typeof account.id !== "number" ||
    typeof account.login !== "string"
  ) {
    throw new Error("GitHub installation account identity is unavailable");
  }
  return {
    githubAccountId: account.id,
    accountLogin: account.login,
    accountType: account.type === "Organization" ? ACCOUNT_TYPE.ORGANIZATION : ACCOUNT_TYPE.USER,
  };
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
