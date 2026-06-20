/**
 * Folio decomposition worker.
 *
 * Claims `review_pull` jobs from the Postgres SKIP-LOCKED queue (enqueued by the
 * GitHub webhook on PR open/sync), runs the PR → chapters decomposition via
 * ReviewPullFacade (fetch diff → decompose → persist → comment), and marks the
 * job succeeded/failed. Crashed-worker leases are reclaimed by reclaimExpiredJobs.
 */
import "reflect-metadata";
import { JOB_KIND, type Job, claimJob, completeJob, failJob, reclaimExpiredJobs } from "@folio/db";
import { ReviewPullFacade } from "./application/review/review-pull.facade.js";
import { bootstrapGitHub } from "./internal/github/github-bootstrap.js";

const WORKER_ID = `worker-${process.pid}`;
// Generous lease: a single decomposition (diff fetch + LLM) can take minutes;
// the reaper only reclaims work from genuinely dead workers, not slow ones.
const LEASE_MS = 10 * 60_000;
const POLL_MS = 2_000;

export interface ProcessJobDeps {
  runReview: (input: { owner: string; repo: string; number: number }) => Promise<unknown>;
  complete: (jobId: string, result: unknown) => Promise<void>;
  fail: (jobId: string, error: string) => Promise<void>;
}

/** Run one claimed review_pull job to terminal state. Never throws. */
export async function processReviewPullJob(job: Job, deps: ProcessJobDeps): Promise<void> {
  try {
    if (job.payload.kind !== JOB_KIND.REVIEW_PULL) {
      throw new Error(`worker received unexpected job kind: ${job.payload.kind}`);
    }
    const { owner, repo, number } = job.payload;
    const result = await deps.runReview({ owner, repo, number });
    await deps.complete(job.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[folio] worker job ${job.id} failed: ${message}`);
    await deps.fail(job.id, message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loop(): Promise<void> {
  bootstrapGitHub();
  const facade = new ReviewPullFacade();
  const deps: ProcessJobDeps = {
    runReview: (input) => facade.run(input),
    complete: (jobId, result) => completeJob(jobId, result),
    fail: (jobId, error) => failJob(jobId, error),
  };

  console.log(`[folio] worker started (${WORKER_ID})`);
  for (;;) {
    await reclaimExpiredJobs();
    const job = await claimJob({
      kinds: [JOB_KIND.REVIEW_PULL],
      leaseMs: LEASE_MS,
      workerId: WORKER_ID,
    });
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }
    console.log(`[folio] worker claimed job ${job.id} (${job.payload.kind})`);
    await processReviewPullJob(job, deps);
  }
}

// Only run the loop when executed directly, so tests can import the pure handler.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void loop();
}
