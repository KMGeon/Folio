import { describe, expect, it, vi } from "vitest";
import { processReviewPullJob, runScheduledReconcileIfDue } from "./worker.js";
import type { Job } from "@folio/db";

function reviewPullJob(): Job {
  return {
    id: "job-1",
    payload: { kind: "review_pull", owner: "acme", repo: "widget", number: 7, headSha: "h1" },
  } as unknown as Job;
}

describe("processReviewPullJob", () => {
  it("runs the review and marks the job succeeded", async () => {
    const runReview = vi.fn(async () => ({ prId: "pr1" }));
    const complete = vi.fn(async () => undefined);
    const fail = vi.fn(async () => undefined);

    await processReviewPullJob(reviewPullJob(), {
      runReview,
      runIndexBackfill: vi.fn(),
      complete,
      fail,
    });

    expect(runReview).toHaveBeenCalledWith({ owner: "acme", repo: "widget", number: 7 });
    expect(complete).toHaveBeenCalledWith("job-1", { prId: "pr1" });
    expect(fail).not.toHaveBeenCalled();
  });

  it("marks the job failed when the review throws", async () => {
    const runReview = vi.fn(async () => {
      throw new Error("boom");
    });
    const complete = vi.fn(async () => undefined);
    const fail = vi.fn(async () => undefined);

    await processReviewPullJob(reviewPullJob(), {
      runReview,
      runIndexBackfill: vi.fn(),
      complete,
      fail,
    });

    expect(fail).toHaveBeenCalledWith("job-1", "boom");
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("runScheduledReconcileIfDue", () => {
  it("runs a bounded round when the interval is due", async () => {
    const runRound = vi.fn(async () => undefined);

    const nextAt = await runScheduledReconcileIfDue(1_000, 900, runRound);

    expect(runRound).toHaveBeenCalledWith({ limitRepos: 50 });
    expect(nextAt).toBe(901_000);
  });

  it("does not run before the next interval", async () => {
    const runRound = vi.fn(async () => undefined);

    const nextAt = await runScheduledReconcileIfDue(899, 900, runRound);

    expect(runRound).not.toHaveBeenCalled();
    expect(nextAt).toBe(900);
  });

  it("delays the next attempt when a round fails", async () => {
    const runRound = vi.fn(async () => {
      throw new Error("GitHub unavailable");
    });

    const nextAt = await runScheduledReconcileIfDue(1_000, 900, runRound);

    expect(nextAt).toBe(901_000);
  });
});
