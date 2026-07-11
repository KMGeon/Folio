import type { GitHubRepoAccessLevel } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

const CACHE_TTL_MS = 60_000;
const RANK: Record<GitHubRepoAccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };

/**
 * Live per-viewer repo authorization with a short positive-result cache.
 * Denials are never cached so a granted access reflects within one check.
 */
@Injectable()
export class RepoAccessService {
  private readonly levelCache = new Map<string, { level: GitHubRepoAccessLevel; until: number }>();

  constructor(@Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter) {}

  async getAccessLevel(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<GitHubRepoAccessLevel> {
    const key = `${input.username}:${input.owner}/${input.repo}`;
    const cached = this.levelCache.get(key);
    if (cached && cached.until > Date.now()) {
      return cached.level;
    }
    const level = await this.github.getUserRepoPermissionLevel(
      input.owner,
      input.repo,
      input.username,
    );
    if (level !== "none") {
      this.levelCache.set(key, { level, until: Date.now() + CACHE_TTL_MS });
    }
    return level;
  }

  async assertLevelAtLeast(
    input: { owner: string; repo: string; username: string },
    required: GitHubRepoAccessLevel,
  ): Promise<boolean> {
    return RANK[await this.getAccessLevel(input)] >= RANK[required];
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
      if (cached && cached.until > Date.now()) {
        readable[index] = RANK[cached.level] >= RANK.read;
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
      uncached.forEach(({ index, repository }, batchIndex) => {
        const level = levels[batchIndex] ?? "none";
        readable[index] = RANK[level] >= RANK.read;
        if (level !== "none") {
          this.levelCache.set(this.cacheKey(input.username, repository.owner, repository.name), {
            level,
            until: Date.now() + CACHE_TTL_MS,
          });
        }
      });
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
