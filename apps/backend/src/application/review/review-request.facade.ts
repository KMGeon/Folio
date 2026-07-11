import { getPullRequest } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import { ReviewJobQueue } from "../../infrastructure/persistence/review-job-queue.js";
import { createRepoInstallationOctokit } from "./review-pull.facade.js";

@Injectable()
export class ReviewRequestFacade {
  constructor(@Inject(ReviewJobQueue) private readonly queue: ReviewJobQueue) {}

  async enqueue(input: { owner: string; repo: string; number: number }) {
    const octokit = await createRepoInstallationOctokit(input);
    const summary = await getPullRequest(octokit, input);
    const { job, deduplicated } = await this.queue.enqueueReviewPull({
      ...input,
      headSha: summary.headSha,
    });
    return { jobId: job.id, status: job.status, deduplicated };
  }
}
