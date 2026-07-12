export const ADMIN_WORKER_HEARTBEAT_MS = 10_000;
export const ADMIN_WORKER_STALE_AFTER_MS = 45_000;
export const ADMIN_CODEX_RECENT_SUCCESS_MS = 24 * 60 * 60 * 1000;

export type AdminWorkerItemStatus = "ok" | "stale";
export type AdminWorkerFleetStatus = "ok" | "stale" | "unknown";
export type AdminCodexPathStatus = "recent_success" | "aging" | "no_success";

export function workerHeartbeatItemStatus(
  lastSeenAt: Date,
  now: Date = new Date(),
  staleAfterMs: number = ADMIN_WORKER_STALE_AFTER_MS,
): AdminWorkerItemStatus {
  return now.getTime() - lastSeenAt.getTime() <= staleAfterMs ? "ok" : "stale";
}

export function workerFleetStatus(
  itemStatuses: readonly AdminWorkerItemStatus[],
): AdminWorkerFleetStatus {
  if (itemStatuses.length === 0) {
    return "unknown";
  }
  return itemStatuses.some((status) => status === "ok") ? "ok" : "stale";
}

export function codexPathStatus(
  lastReviewPullSucceededAt: Date | null,
  now: Date = new Date(),
  recentMs: number = ADMIN_CODEX_RECENT_SUCCESS_MS,
): AdminCodexPathStatus {
  if (!lastReviewPullSucceededAt) {
    return "no_success";
  }
  return now.getTime() - lastReviewPullSucceededAt.getTime() <= recentMs
    ? "recent_success"
    : "aging";
}

export const CODEX_PATH_NOTE = "Based on last succeeded review_pull job, not a live Codex probe.";
