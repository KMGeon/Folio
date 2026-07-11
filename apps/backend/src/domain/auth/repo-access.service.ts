import type { GitHubRepoAccessLevel } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import { GitHubRepositoryPermissionPort } from "./github-repository-permission.port.js";
import { RepositoryPermissionGrantCache } from "./repository-permission-grant-cache.js";

const RANK: Record<GitHubRepoAccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };

/**
 * Live per-viewer repo authorization with a short positive-result cache.
 * Denials are never cached so a granted access reflects within one check.
 */
@Injectable()
export class RepoAccessService {
  private readonly levelCache = new RepositoryPermissionGrantCache();

  constructor(
    @Inject(GitHubRepositoryPermissionPort)
    private readonly github: GitHubRepositoryPermissionPort,
  ) {}

  async getAccessLevel(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<GitHubRepoAccessLevel> {
    const key = `${input.username}:${input.owner}/${input.repo}`;
    const cached = this.levelCache.get(key);
    if (cached) {
      return cached;
    }
    const level = await this.github.getUserRepoPermissionLevel(
      input.owner,
      input.repo,
      input.username,
    );
    if (level !== "none") {
      this.levelCache.retain(key, level);
    }
    return level;
  }

  async assertLevelAtLeast(
    input: { owner: string; repo: string; username: string },
    required: GitHubRepoAccessLevel,
  ): Promise<boolean> {
    return RANK[await this.getAccessLevel(input)] >= RANK[required];
  }

  async assertLiveLevelAtLeast(
    input: { owner: string; repo: string; username: string },
    required: GitHubRepoAccessLevel,
  ): Promise<boolean> {
    const level = await this.github.getUserRepoPermissionLevel(
      input.owner,
      input.repo,
      input.username,
    );
    return RANK[level] >= RANK[required];
  }

  async filterReadableResolvedRepositories<
    T extends { installationId: string; owner: string; name: string },
  >(input: {
    installations: readonly { id: string; githubInstallationId: number }[];
    repositories: readonly T[];
    username: string;
  }): Promise<T[]> {
    const readable = Array.from({ length: input.repositories.length }, () => false);
    const uncached: { index: number; repository: T }[] = [];
    input.repositories.forEach((repository, index) => {
      const cached = this.levelCache.get(
        this.cacheKey(input.username, repository.owner, repository.name),
      );
      if (cached) {
        readable[index] = RANK[cached] >= RANK.read;
      } else {
        uncached.push({ index, repository });
      }
    });

    try {
      const levels = await this.github.getResolvedRepositoryPermissionLevels({
        installations: input.installations,
        repositories: uncached.map(({ repository }) => ({
          installationId: repository.installationId,
          owner: repository.owner,
          repo: repository.name,
        })),
        username: input.username,
      });
      const positiveGrants: { key: string; level: Exclude<GitHubRepoAccessLevel, "none"> }[] = [];
      uncached.forEach(({ index, repository }, batchIndex) => {
        const level = levels[batchIndex] ?? "none";
        readable[index] = RANK[level] >= RANK.read;
        if (level !== "none") {
          positiveGrants.push({
            key: this.cacheKey(input.username, repository.owner, repository.name),
            level,
          });
        }
      });
      this.levelCache.retainMany(positiveGrants);
    } catch {
      // A failed batch is a denial for every uncached repository; cached grants remain valid.
    }
    return input.repositories.filter((_, index) => readable[index]);
  }

  // Kept for the existing read-scoped RepoAccessGuard.
  async assertAccessAllowed(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<boolean> {
    return this.assertLevelAtLeast(input, "read");
  }

  private cacheKey(username: string, owner: string, repo: string): string {
    return `${username}:${owner}/${repo}`;
  }
}
