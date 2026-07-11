import type { GitHubRepoAccessLevel } from "@folio/github";

export const REPOSITORY_PERMISSION_CACHE_TTL_MS = 60_000;
export const REPOSITORY_PERMISSION_CACHE_MAX_ENTRIES = 1_000;

type PositiveRepoAccessLevel = Exclude<GitHubRepoAccessLevel, "none">;

type CachedRepositoryPermissionGrant = {
  level: PositiveRepoAccessLevel;
  until: number;
};

/** Bounds short-lived grants even when dashboard discovery sees unbounded user/repository pairs. */
export class RepositoryPermissionGrantCache {
  private readonly grants = new Map<string, CachedRepositoryPermissionGrant>();

  get size(): number {
    return this.grants.size;
  }

  get(key: string, now = Date.now()): PositiveRepoAccessLevel | undefined {
    const cached = this.grants.get(key);
    if (!cached) {
      return undefined;
    }
    if (cached.until <= now) {
      this.grants.delete(key);
      return undefined;
    }

    this.grants.delete(key);
    this.grants.set(key, cached);
    return cached.level;
  }

  retain(key: string, level: PositiveRepoAccessLevel, now = Date.now()): void {
    this.retainMany([{ key, level }], now);
  }

  retainMany(
    entries: readonly { key: string; level: PositiveRepoAccessLevel }[],
    now = Date.now(),
  ): void {
    this.pruneExpired(now);
    for (const entry of entries) {
      this.grants.delete(entry.key);
      this.grants.set(entry.key, {
        level: entry.level,
        until: now + REPOSITORY_PERMISSION_CACHE_TTL_MS,
      });
      this.trimToMaximum();
    }
  }

  private pruneExpired(now: number): void {
    for (const [key, cached] of this.grants) {
      if (cached.until <= now) {
        this.grants.delete(key);
      }
    }
  }

  private trimToMaximum(): void {
    while (this.grants.size > REPOSITORY_PERMISSION_CACHE_MAX_ENTRIES) {
      const oldestKey = this.grants.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.grants.delete(oldestKey);
    }
  }
}
