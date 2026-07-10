import type { GitHubRepoAccessLevel } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import { config } from "../../config.js";
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
    if (config.APP_PROFILE === "dev") {
      // Dev mode uses local fixture identity, so live GitHub repo checks would block local review UX.
      return "admin";
    }
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

  // Kept for the existing read-scoped RepoAccessGuard.
  async assertAccessAllowed(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<boolean> {
    return this.assertLevelAtLeast(input, "read");
  }
}
