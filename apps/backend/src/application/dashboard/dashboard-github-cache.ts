type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const dashboardGithubCache = new Map<string, CacheEntry<unknown>>();

export const DASHBOARD_OPEN_PULL_LIST_TTL_MS = 2 * 60 * 1000;
export const DASHBOARD_CLOSED_PULL_LIST_TTL_MS = 15 * 60 * 1000;
export const DASHBOARD_OPEN_PULL_DETAIL_TTL_MS = 2 * 60 * 1000;
export const DASHBOARD_COMPLETED_PULL_DETAIL_TTL_MS = 60 * 60 * 1000;

export function cachedDashboardGithubRequest<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = dashboardGithubCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = load().catch((error: unknown) => {
    if (dashboardGithubCache.get(key)?.promise === promise) {
      dashboardGithubCache.delete(key);
    }
    throw error;
  });
  dashboardGithubCache.set(key, { expiresAt: now + ttlMs, promise });
  return promise;
}

export function clearDashboardGithubCache() {
  dashboardGithubCache.clear();
}
