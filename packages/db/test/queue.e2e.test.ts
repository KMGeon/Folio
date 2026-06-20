import { JOB_KIND, JOB_STATUS } from "@folio/types";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import {
  claimJob,
  completeJob,
  dedupeKeyFor,
  enqueueJob,
  failJob,
  getJob,
  reclaimExpiredJobs,
  renewJobLease,
} from "../src/queue/jobs.js";
import { jobs } from "../src/schema/jobs.js";
import { HAS_DB, getTestDb, nonNull, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

const decomposePayload = {
  kind: JOB_KIND.DECOMPOSE,
  prId: "pr-1",
  revisionId: "rev-1",
} as const;

d("job queue (e2e)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("enqueues a pending job", async () => {
    const job = await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload });
    expect(job.status).toBe(JOB_STATUS.PENDING);
    expect(job.kind).toBe(JOB_KIND.DECOMPOSE);
    expect(job.attempts).toBe(0);
  });

  it("dedupes on (repo, headSha, kind)", async () => {
    const dedupeKey = dedupeKeyFor("repo-1", "sha-1", JOB_KIND.DECOMPOSE);
    const a = await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload, dedupeKey });
    const b = await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload, dedupeKey });
    expect(b.id).toBe(a.id);
    const count = await db.select({ id: jobs.id }).from(jobs);
    expect(count).toHaveLength(1);
  });

  it("claims with SKIP LOCKED so each job is claimed exactly once", async () => {
    const N = 12;
    for (let i = 0; i < N; i++) {
      await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload });
    }
    // Fire many concurrent claimers; SKIP LOCKED must hand each job to one.
    const claimers = Array.from({ length: N * 2 }, (_, i) =>
      claimJob({ leaseMs: 30_000, workerId: `w${i}` }),
    );
    const results = await Promise.all(claimers);
    const claimed = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const ids = claimed.map((j) => j.id);
    expect(ids).toHaveLength(N);
    expect(new Set(ids).size).toBe(N); // no double-claim
    for (const j of claimed) {
      expect(j.status).toBe(JOB_STATUS.RUNNING);
      expect(j.attempts).toBe(1);
      expect(j.lockedBy).toMatch(/^w/);
    }
  });

  it("skips jobs whose runAfter is in the future", async () => {
    await enqueueJob({
      kind: JOB_KIND.DECOMPOSE,
      payload: decomposePayload,
      runAfter: new Date(Date.now() + 60_000),
    });
    const job = await claimJob({ leaseMs: 10_000, workerId: "w" });
    expect(job).toBeNull();
  });

  it("completes a job", async () => {
    await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload });
    const claimed = nonNull(await claimJob({ leaseMs: 10_000, workerId: "w" }));
    await completeJob(claimed.id, { ok: true });
    const after = await getJob(claimed.id);
    expect(after?.status).toBe(JOB_STATUS.SUCCEEDED);
  });

  it("retries with backoff then dies at maxAttempts", async () => {
    const job = await enqueueJob({
      kind: JOB_KIND.DECOMPOSE,
      payload: decomposePayload,
      maxAttempts: 2,
    });
    // Attempt 1
    let claimed = await claimJob({ leaseMs: 10_000, workerId: "w" });
    expect(claimed?.attempts).toBe(1);
    await failJob(job.id, "boom");
    let row = nonNull(await getJob(job.id));
    expect(row.status).toBe(JOB_STATUS.FAILED);
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());

    // Force runAfter into the past so it is claimable again.
    await db
      .update(jobs)
      .set({ runAfter: new Date(Date.now() - 1000) })
      .where(sql`true`);
    claimed = await claimJob({ leaseMs: 10_000, workerId: "w" });
    expect(claimed?.attempts).toBe(2);
    await failJob(job.id, "boom again");
    row = nonNull(await getJob(job.id));
    expect(row.status).toBe(JOB_STATUS.DEAD);
  });

  it("reclaims expired leases back to pending", async () => {
    const job = await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload });
    await claimJob({ leaseMs: 10_000, workerId: "w" });
    // Expire the lease.
    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(sql`true`);
    const n = await reclaimExpiredJobs();
    expect(n).toBe(1);
    const row = await getJob(job.id);
    expect(row?.status).toBe(JOB_STATUS.PENDING);
    expect(row?.lockedBy).toBeNull();
  });

  it("renewJobLease prevents reclaim while heartbeating", async () => {
    await enqueueJob({ kind: JOB_KIND.DECOMPOSE, payload: decomposePayload });
    const claimed = nonNull(await claimJob({ leaseMs: 50, workerId: "w" }));
    await renewJobLease(claimed.id, 30_000);
    const n = await reclaimExpiredJobs();
    expect(n).toBe(0);
    const row = await getJob(claimed.id);
    expect(row?.status).toBe(JOB_STATUS.RUNNING);
  });

  it("filters claims by kind", async () => {
    await enqueueJob({
      kind: JOB_KIND.SYNC_COMMENTS,
      payload: { kind: JOB_KIND.SYNC_COMMENTS, prId: "pr-1" },
    });
    const wrong = await claimJob({
      kinds: [JOB_KIND.DECOMPOSE],
      leaseMs: 10_000,
      workerId: "w",
    });
    expect(wrong).toBeNull();
    const right = await claimJob({
      kinds: [JOB_KIND.SYNC_COMMENTS],
      leaseMs: 10_000,
      workerId: "w",
    });
    expect(right?.kind).toBe(JOB_KIND.SYNC_COMMENTS);
  });
});
