import { Injectable } from "@nestjs/common";
import { JOB_KIND, type EnqueueJobOutcome, dedupeKeyFor, enqueueJobWithOutcome } from "@folio/db";

export interface EnqueueReviewPullInput {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
}

/**
 * Enqueues webhook-driven review jobs. Idempotent per `(repo, headSha)` so a PR
 * that fires `opened` then `synchronize` for the same commit, or a redelivered
 * webhook, collapses to a single decomposition.
 */
@Injectable()
export class ReviewJobQueue {
  async enqueueReviewPull(input: EnqueueReviewPullInput): Promise<EnqueueJobOutcome> {
    const fullName = `${input.owner}/${input.repo}`;
    return enqueueJobWithOutcome({
      kind: JOB_KIND.REVIEW_PULL,
      payload: { kind: JOB_KIND.REVIEW_PULL, ...input },
      dedupeKey: dedupeKeyFor(fullName, input.headSha, JOB_KIND.REVIEW_PULL),
    });
  }
}
