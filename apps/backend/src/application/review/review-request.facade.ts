import {
  JOB_KIND,
  type Job,
  dedupeKeyFor,
  findActiveJobByDedupeKey,
  getLatestJobsByDedupeKeys,
} from "@folio/db";
import { getPullRequest } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import { ReviewJobQueue } from "../../infrastructure/persistence/review-job-queue.js";
import { projectReviewLifecycle, type ReviewAnalysisStatus } from "./review-lifecycle.js";
import { createRepoInstallationOctokit } from "./review-pull.facade.js";

export interface ReviewGenerationResult {
  jobId: string | null;
  status: string | null;
  deduplicated: boolean;
  analysisStatus: ReviewAnalysisStatus;
  headSha: string | null;
}

@Injectable()
export class ReviewRequestFacade {
  constructor(@Inject(ReviewJobQueue) private readonly queue: ReviewJobQueue) {}

  async enqueue(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<ReviewGenerationResult> {
    const { fullName, headSha } = await resolveHead(input);
    const dedupeKey = dedupeKeyFor(fullName, headSha, JOB_KIND.REVIEW_PULL);

    // Prefer an explicit active-job lookup so in-flight worker work never enqueues a twin.
    const active = await findActiveJobByDedupeKey(dedupeKey);
    if (active) {
      return toResult(active, true, headSha);
    }

    const { job, deduplicated } = await this.queue.enqueueReviewPull({
      ...input,
      headSha,
    });
    return toResult(job, deduplicated, headSha);
  }

  async generationStatus(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<ReviewGenerationResult> {
    const { fullName, headSha } = await resolveHead(input);
    const dedupeKey = dedupeKeyFor(fullName, headSha, JOB_KIND.REVIEW_PULL);
    const active = await findActiveJobByDedupeKey(dedupeKey);
    if (active) {
      return toResult(active, true, headSha);
    }
    const latest = (await getLatestJobsByDedupeKeys([dedupeKey])).get(dedupeKey) ?? null;
    if (!latest) {
      return {
        jobId: null,
        status: null,
        deduplicated: false,
        analysisStatus: "not_requested",
        headSha,
      };
    }
    return toResult(latest, false, headSha);
  }
}

async function resolveHead(input: { owner: string; repo: string; number: number }) {
  const octokit = await createRepoInstallationOctokit(input);
  const summary = await getPullRequest(octokit, input);
  return { fullName: `${input.owner}/${input.repo}`, headSha: summary.headSha };
}

function toResult(job: Job, deduplicated: boolean, headSha: string): ReviewGenerationResult {
  const lifecycle = projectReviewLifecycle(job);
  return {
    jobId: job.id,
    status: job.status,
    deduplicated,
    analysisStatus: lifecycle.analysisStatus,
    headSha,
  };
}
