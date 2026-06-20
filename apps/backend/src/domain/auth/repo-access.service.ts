import { Inject, Injectable } from "@nestjs/common";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

const CACHE_TTL_MS = 60_000;

/**
 * Live per-viewer repo authorization with a short positive-result cache.
 * Denials are never cached so a granted access reflects within one check.
 */
@Injectable()
export class RepoAccessService {
  private readonly allowCache = new Map<string, number>();

  constructor(@Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter) {}

  async assertAccessAllowed(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<boolean> {
    const key = `${input.username}:${input.owner}/${input.repo}`;
    const cachedUntil = this.allowCache.get(key);
    if (cachedUntil && cachedUntil > Date.now()) {
      return true;
    }
    const allowed = await this.github.userCanAccessRepo(input.owner, input.repo, input.username);
    if (allowed) {
      this.allowCache.set(key, Date.now() + CACHE_TTL_MS);
    }
    return allowed;
  }
}
