import {
  buildAuthorizeUrl,
  checkUserRepoPermission,
  createInstallationOctokit,
  exchangeOAuthCode,
  getAuthenticatedUser,
  type GitHubRepoAccessLevel,
  getUserRepoPermissionLevel,
  type OAuthUser,
} from "@folio/github";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import { Injectable } from "@nestjs/common";
import { config } from "../../config.js";

@Injectable()
export class GitHubOAuthAdapter {
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

  async exchangeCodeForUser(code: string): Promise<OAuthUser> {
    const { accessToken } = await exchangeOAuthCode({
      clientId: config.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: config.GITHUB_APP_CLIENT_SECRET ?? "",
      code,
    });
    // Token is used once for identity, then discarded (design Model B).
    return getAuthenticatedUser({ accessToken });
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

  private async resolveRepo(owner: string, repo: string) {
    return repositoriesRepo.getByFullName(`${owner}/${repo}`);
  }
}
