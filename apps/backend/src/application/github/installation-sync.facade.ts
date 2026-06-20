import { Injectable } from "@nestjs/common";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import type { AccountType } from "@folio/types";
import { createInstallationOctokit } from "@folio/github";

export interface InstallationAccount {
  login: string;
  type: AccountType;
}

export interface SyncInstallationInput {
  githubInstallationId: number;
  /** From the `installation`/`installation_repositories` payload; absent on some redeliveries. */
  account?: InstallationAccount;
}

/**
 * Persists a GitHub App installation and the repositories it can access so the
 * review path can resolve an installation token by repo full name. Without this,
 * webhook-driven decomposition has no credentials and `ReviewPullFacade` rejects
 * the repo as "not installed".
 */
@Injectable()
export class InstallationSyncFacade {
  async sync(input: SyncInstallationInput): Promise<void> {
    const installation = input.account
      ? await installationsRepo.upsertByGithubId({
          githubInstallationId: input.githubInstallationId,
          accountLogin: input.account.login,
          accountType: input.account.type,
        })
      : await installationsRepo.getByGithubId(input.githubInstallationId);

    // No account on the payload and none on record: nothing to anchor repos to.
    if (!installation) {
      return;
    }

    const octokit = await createInstallationOctokit(input.githubInstallationId);
    const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    });

    for (const repo of repos) {
      await repositoriesRepo.upsertByGithubId({
        installationId: installation.id,
        githubRepoId: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
      });
    }
  }
}
