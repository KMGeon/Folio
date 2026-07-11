import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueJobWithOutcome = vi.fn(async (input: unknown) => ({
  job: { id: "job-1", ...(input as object) },
  deduplicated: false,
}));

vi.mock("@folio/db", () => ({
  JOB_KIND: { REVIEW_PULL: "review_pull" },
  dedupeKeyFor: (repo: string, sha: string, kind: string) => `${repo}:${sha}:${kind}`,
  enqueueJobWithOutcome,
}));

const { ReviewJobQueue } = await import("./review-job-queue.js");

describe("ReviewJobQueue", () => {
  beforeEach(() => enqueueJobWithOutcome.mockClear());

  it("enqueues a review_pull job with a repo+headSha dedupe key", async () => {
    const queue = new ReviewJobQueue();
    await queue.enqueueReviewPull({ owner: "acme", repo: "widget", number: 7, headSha: "abc123" });

    expect(enqueueJobWithOutcome).toHaveBeenCalledTimes(1);
    expect(enqueueJobWithOutcome).toHaveBeenCalledWith({
      kind: "review_pull",
      payload: { kind: "review_pull", owner: "acme", repo: "widget", number: 7, headSha: "abc123" },
      dedupeKey: "acme/widget:abc123:review_pull",
    });
  });
});
