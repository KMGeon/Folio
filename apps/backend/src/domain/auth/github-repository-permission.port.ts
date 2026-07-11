import type { GitHubRepoAccessLevel } from "@folio/github";

export type ResolvedRepositoryPermissionInput = {
  installationId: string;
  owner: string;
  repo: string;
};

export type ResolvedInstallationPermissionInput = {
  id: string;
  githubInstallationId: number;
};

/** Domain boundary for GitHub-backed repository authorization decisions. */
export abstract class GitHubRepositoryPermissionPort {
  abstract getUserRepoPermissionLevel(
    owner: string,
    repo: string,
    username: string,
  ): Promise<GitHubRepoAccessLevel>;

  abstract getResolvedRepositoryPermissionLevels(input: {
    installations: readonly ResolvedInstallationPermissionInput[];
    repositories: readonly ResolvedRepositoryPermissionInput[];
    username: string;
  }): Promise<GitHubRepoAccessLevel[]>;
}
