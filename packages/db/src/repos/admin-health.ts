import { and, eq, max, sql } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { jobs } from "../schema/jobs.js";
import {
  ADMIN_WORKER_STALE_AFTER_MS,
  CODEX_PATH_NOTE,
  codexPathStatus,
  workerFleetStatus,
  workerHeartbeatItemStatus,
} from "./admin-health-status.js";
import { adminJobsRepo } from "./admin-jobs.js";
import { workerHeartbeatsRepo } from "./worker-heartbeats.js";

export interface AdminHealthProjection {
  checkedAt: Date;
  worker: {
    status: "ok" | "stale" | "unknown";
    staleAfterSeconds: number;
    workers: {
      workerId: string;
      lastSeenAt: Date;
      startedAt: Date;
      ageSeconds: number;
      status: "ok" | "stale";
    }[];
  };
  codexPath: {
    status: "recent_success" | "aging" | "no_success";
    lastReviewPullSucceededAt: Date | null;
    reviewPullSucceededLast24h: number;
    reviewPullFailedLast24h: number;
    note: string;
  };
  queue: {
    pending: number;
    distressedJobs: number;
  };
}

export const adminHealthRepo = {
  async getProjection(db: Db = getDb(), now: Date = new Date()): Promise<AdminHealthProjection> {
    const [heartbeatRows, codex, queue] = await Promise.all([
      workerHeartbeatsRepo.listAll(db),
      loadCodexPath(db, now),
      adminJobsRepo.countOverview(db, now),
    ]);

    const workers = heartbeatRows.map((row) => {
      const ageMs = Math.max(0, now.getTime() - row.lastSeenAt.getTime());
      return {
        workerId: row.workerId,
        lastSeenAt: row.lastSeenAt,
        startedAt: row.startedAt,
        ageSeconds: Math.floor(ageMs / 1000),
        status: workerHeartbeatItemStatus(row.lastSeenAt, now),
      };
    });

    return {
      checkedAt: now,
      worker: {
        status: workerFleetStatus(workers.map((worker) => worker.status)),
        staleAfterSeconds: Math.floor(ADMIN_WORKER_STALE_AFTER_MS / 1000),
        workers,
      },
      codexPath: {
        ...codex,
        note: CODEX_PATH_NOTE,
      },
      queue: {
        pending: queue.pending,
        distressedJobs: queue.distressedJobs,
      },
    };
  },
};

async function loadCodexPath(db: Db, now: Date) {
  // postgres.js rejects raw Date params in drizzle sql fragments; bind ISO strings.
  const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [lastSuccess] = await db
    .select({ value: max(jobs.updatedAt) })
    .from(jobs)
    .where(and(eq(jobs.kind, "review_pull"), eq(jobs.status, "succeeded")));

  const [counts] = await db
    .select({
      reviewPullSucceededLast24h: sql<number>`count(*) filter (
        where ${jobs.status} = 'succeeded' and ${jobs.updatedAt} >= ${dayAgoIso}
      )::int`,
      reviewPullFailedLast24h: sql<number>`count(*) filter (
        where ${jobs.status} in ('failed', 'dead') and ${jobs.updatedAt} >= ${dayAgoIso}
      )::int`,
    })
    .from(jobs)
    .where(eq(jobs.kind, "review_pull"));

  const lastReviewPullSucceededAt = lastSuccess?.value ?? null;
  return {
    status: codexPathStatus(lastReviewPullSucceededAt, now),
    lastReviewPullSucceededAt,
    reviewPullSucceededLast24h: counts?.reviewPullSucceededLast24h ?? 0,
    reviewPullFailedLast24h: counts?.reviewPullFailedLast24h ?? 0,
  };
}
