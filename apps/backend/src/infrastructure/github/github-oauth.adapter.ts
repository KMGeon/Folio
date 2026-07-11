import {
  buildAuthorizeUrl,
  checkUserRepoPermission,
  createInstallationOctokit,
  exchangeOAuthCode,
  getAuthenticatedUser,
  getInstallationAccount as resolveInstallationAccount,
  type GitHubRepoAccessLevel,
  getUserRepoPermissionLevel,
  type OAuthUser,
  verifyUserInstallationAccess,
} from "@folio/github";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import { Injectable } from "@nestjs/common";
import { config } from "../../config.js";
import type {
  GitHubInstallationIdentity,
  GitHubInstallationIdentityPort,
} from "../../domain/auth/github-installation-identity.port.js";
import {
  type GitHubRepositoryPermissionPort,
  type ResolvedInstallationPermissionInput,
  type ResolvedRepositoryPermissionInput,
} from "../../domain/auth/github-repository-permission.port.js";

export const RESOLVED_REPOSITORY_PERMISSION_CONCURRENCY = 4;

@Injectable()
export class GitHubOAuthAdapter
  implements GitHubInstallationIdentityPort, GitHubRepositoryPermissionPort
{
  private callbackUrl(): string {
    return `${config.PUBLIC_API_BASE_URL}/api/v1/auth/github/callback`;
  }

  authorizeUrl(state: string): string {
    return buildAuthorizeUrl({
      clientId: config.GITHUB_APP_CLIENT_ID ?? "",
      redirectUri: this.callbackUrl(),
      state,
    });
  }

  async exchangeCodeForUser(code: string, installationId?: number): Promise<OAuthUser> {
    const { accessToken } = await exchangeOAuthCode({
      clientId: config.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: config.GITHUB_APP_CLIENT_SECRET ?? "",
      code,
    });
    const user = await getAuthenticatedUser({ accessToken });
    if (installationId !== undefined) {
      // Only the user token can prove this callback user controls the claimed installation.
      await verifyUserInstallationAccess({ accessToken, installationId });
    }
    return user;
  }

  resolveInstallationIdentity(installationId: number): Promise<GitHubInstallationIdentity> {
    return resolveInstallationAccount(installationId);
  }

  async userCanAccessRepo(owner: string, repo: string, username: string): Promise<boolean> {
    const repository = await this.resolveRepo(owner, repo);
    if (!repository) {
      return false;
    }
    const installation = await installationsRepo.getById(repository.installationId);
    if (!installation) {
      return false;
    }
    const client = await createInstallationOctokit(installation.githubInstallationId);
    return checkUserRepoPermission(client, { owner, repo, username });
  }

  async getUserRepoPermissionLevel(
    owner: string,
    repo: string,
    username: string,
  ): Promise<GitHubRepoAccessLevel> {
    const repository = await this.resolveRepo(owner, repo);
    if (!repository) {
      return "none";
    }
    const installation = await installationsRepo.getById(repository.installationId);
    if (!installation) {
      return "none";
    }
    const client = await createInstallationOctokit(installation.githubInstallationId);
    return getUserRepoPermissionLevel(client, { owner, repo, username });
  }

  async getResolvedRepositoryPermissionLevels(input: {
    installations: readonly ResolvedInstallationPermissionInput[];
    repositories: readonly ResolvedRepositoryPermissionInput[];
    username: string;
  }): Promise<GitHubRepoAccessLevel[]> {
    const levels = Array.from<GitHubRepoAccessLevel>({ length: input.repositories.length }).fill(
      "none",
    );
    const installations = new Map(
      input.installations.map((installation) => [installation.id, installation]),
    );
    const clients = new Map<string, ReturnType<typeof createInstallationOctokit>>();
    let nextIndex = 0;
    const workers = Array.from(
      {
        length: Math.min(RESOLVED_REPOSITORY_PERMISSION_CONCURRENCY, input.repositories.length),
      },
      async () => {
        for (;;) {
          const index = nextIndex;
          nextIndex += 1;
          const repository = input.repositories[index];
          if (!repository) {
            return;
          }
          const installation = installations.get(repository.installationId);
          if (!installation) {
            continue;
          }
          try {
            let client = clients.get(installation.id);
            if (!client) {
              client = createInstallationOctokit(installation.githubInstallationId);
              clients.set(installation.id, client);
            }
            levels[index] = await getUserRepoPermissionLevel(await client, {
              owner: repository.owner,
              repo: repository.repo,
              username: input.username,
            });
          } catch {
            // Dashboard discovery is fail-closed: unavailable permission data must not expose repos.
            levels[index] = "none";
          }
        }
      },
    );
    await Promise.all(workers);
    return levels;
  }

  private async resolveRepo(owner: string, repo: string) {
    return repositoriesRepo.getByFullName(`${owner}/${repo}`);
  }
}
