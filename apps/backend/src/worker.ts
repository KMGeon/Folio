/**
 * Folio worker.
 *
 * Claims jobs from the Postgres SKIP-LOCKED queue:
 * - `review_pull`: PR → chapters decomposition via ReviewPullFacade
 * - `pr_index_backfill`: populate pull_request_index for a repository
 */
import "reflect-metadata";
import { JOB_KIND, type Job, claimJob, completeJob, failJob, reclaimExpiredJobs } from "@folio/db";
import { BoardEventHub } from "./application/dashboard/board-event-hub.js";
import { PullRequestIndexBackfill } from "./application/dashboard/pull-request-index-backfill.js";
import { PullRequestIndexWriter } from "./application/dashboard/pull-request-index-writer.js";
import { ReviewPullFacade } from "./application/review/review-pull.facade.js";
import { bootstrapGitHub } from "./internal/github/github-bootstrap.js";

const WORKER_ID = `worker-${process.pid}`;
// Generous lease: a single decomposition (diff fetch + LLM) can take minutes;
// the reaper only reclaims work from genuinely dead workers, not slow ones.
const LEASE_MS = 10 * 60_000;
const POLL_MS = 2_000;

export interface ProcessJobDeps {
  runReview: (input: { owner: string; repo: string; number: number }) => Promise<unknown>;
  runIndexBackfill: (repositoryId: string) => Promise<unknown>;
  complete: (jobId: string, result: unknown) => Promise<void>;
  fail: (jobId: string, error: string) => Promise<void>;
}

/** Run one claimed job to terminal state. Never throws. */
export async function processWorkerJob(job: Job, deps: ProcessJobDeps): Promise<void> {
  try {
    if (job.payload.kind === JOB_KIND.REVIEW_PULL) {
      const { owner, repo, number } = job.payload;
      const result = await deps.runReview({ owner, repo, number });
      await deps.complete(job.id, result);
      return;
    }
    if (job.payload.kind === JOB_KIND.PR_INDEX_BACKFILL) {
      const result = await deps.runIndexBackfill(job.payload.repositoryId);
      await deps.complete(job.id, result ?? { ok: true });
      return;
    }
    throw new Error(`worker received unexpected job kind: ${job.payload.kind}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[folio] worker job ${job.id} failed: ${message}`);
    await deps.fail(job.id, message);
  }
}

/** @deprecated use processWorkerJob */
export async function processReviewPullJob(job: Job, deps: ProcessJobDeps): Promise<void> {
  return processWorkerJob(job, deps);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loop(): Promise<void> {
  bootstrapGitHub();
  const facade = new ReviewPullFacade();
  const hub = new BoardEventHub();
  const writer = new PullRequestIndexWriter(hub);
  const backfill = new PullRequestIndexBackfill(writer, hub);
  const deps: ProcessJobDeps = {
    runReview: (input) => facade.run(input),
    runIndexBackfill: (repositoryId) => backfill.runForRepository(repositoryId),
    complete: (jobId, result) => completeJob(jobId, result),
    fail: (jobId, error) => failJob(jobId, error),
  };

  console.log(`[folio] worker started (${WORKER_ID})`);
  for (;;) {
    await reclaimExpiredJobs();
    const job = await claimJob({
      kinds: [JOB_KIND.REVIEW_PULL, JOB_KIND.PR_INDEX_BACKFILL],
      leaseMs: LEASE_MS,
      workerId: WORKER_ID,
    });
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }
    console.log(`[folio] worker claimed job ${job.id} (${job.payload.kind})`);
    await processWorkerJob(job, deps);
  }
}

// Only run the loop when executed directly, so tests can import the pure handler.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void loop();
}
