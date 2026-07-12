import { ADMIN_WORKER_HEARTBEAT_MS, workerHeartbeatsRepo } from "@folio/db";

/**
 * Heartbeat must run off the job claim loop so long review_pull work does not
 * look like a dead worker to Admin Health.
 */
export function startWorkerHeartbeat(
  workerId: string,
  deps: {
    upsert?: (workerId: string) => Promise<unknown>;
    intervalMs?: number;
  } = {},
): { stop: () => void } {
  const upsert = deps.upsert ?? ((id: string) => workerHeartbeatsRepo.upsertHeartbeat(id));
  const intervalMs = deps.intervalMs ?? ADMIN_WORKER_HEARTBEAT_MS;

  const tick = () => {
    void upsert(workerId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[folio] worker heartbeat failed: ${message}`);
    });
  };

  tick();
  const handle = setInterval(tick, intervalMs);
  // Allow the Node process to exit without waiting on the timer in tests.
  handle.unref?.();

  return {
    stop: () => clearInterval(handle),
  };
}
