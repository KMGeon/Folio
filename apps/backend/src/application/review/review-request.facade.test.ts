import { describe, expect, it, vi } from "vitest";

const getPullRequest = vi.fn(async () => ({ headSha: "head-123" }));
const createRepoInstallationOctokit = vi.fn(async () => ({ rest: {} }));

vi.mock("@folio/github", () => ({ getPullRequest }));
vi.mock("./review-pull.facade.js", () => ({ createRepoInstallationOctokit }));

const { ReviewRequestFacade } = await import("./review-request.facade.js");

describe("ReviewRequestFacade", () => {
  it("enqueues the authoritative GitHub head SHA", async () => {
    const enqueueReviewPull = vi.fn(async () => ({
      job: { id: "job-1", status: "pending" },
      deduplicated: false,
    }));
    const facade = new ReviewRequestFacade({ enqueueReviewPull } as never);

    const result = await facade.enqueue({ owner: "acme", repo: "widget", number: 7 });

    expect(enqueueReviewPull).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      headSha: "head-123",
    });
    expect(result).toEqual({ jobId: "job-1", status: "pending", deduplicated: false });
  });
});
