import { beforeEach, describe, expect, it, vi } from "vitest";

const getPullRequest = vi.fn(async () => ({ headSha: "head-123" }));
const createRepoInstallationOctokit = vi.fn(async () => ({ rest: {} }));
const findActiveJobByDedupeKey = vi.fn(async (): Promise<unknown> => null);
const getLatestJobsByDedupeKeys = vi.fn(async (): Promise<Map<string, unknown>> => new Map());

vi.mock("@folio/github", () => ({ getPullRequest }));
vi.mock("./review-pull.facade.js", () => ({ createRepoInstallationOctokit }));
vi.mock("@folio/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    findActiveJobByDedupeKey,
    getLatestJobsByDedupeKeys,
    dedupeKeyFor: (repo: string, sha: string, kind: string) => `${repo}:${sha}:${kind}`,
    JOB_KIND: { REVIEW_PULL: "review_pull" },
  };
});

const { ReviewRequestFacade } = await import("./review-request.facade.js");

describe("ReviewRequestFacade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findActiveJobByDedupeKey.mockResolvedValue(null);
    getLatestJobsByDedupeKeys.mockResolvedValue(new Map());
  });

  it("enqueues the authoritative GitHub head SHA when no active job exists", async () => {
    const enqueueReviewPull = vi.fn(async () => ({
      job: { id: "job-1", status: "pending", result: null, updatedAt: new Date() },
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
    expect(result).toEqual({
      jobId: "job-1",
      status: "pending",
      deduplicated: false,
      analysisStatus: "processing",
      headSha: "head-123",
    });
  });

  it("returns the in-flight job without enqueueing a duplicate", async () => {
    findActiveJobByDedupeKey.mockResolvedValue({
      id: "job-running",
      status: "running",
      result: null,
      updatedAt: new Date("2026-07-12T00:00:00.000Z"),
    });
    const enqueueReviewPull = vi.fn();
    const facade = new ReviewRequestFacade({ enqueueReviewPull } as never);

    const result = await facade.enqueue({ owner: "acme", repo: "widget", number: 7 });

    expect(enqueueReviewPull).not.toHaveBeenCalled();
    expect(result).toEqual({
      jobId: "job-running",
      status: "running",
      deduplicated: true,
      analysisStatus: "processing",
      headSha: "head-123",
    });
  });

  it("reports generation status for an active job", async () => {
    findActiveJobByDedupeKey.mockResolvedValue({
      id: "job-2",
      status: "claimed",
      result: null,
      updatedAt: new Date("2026-07-12T00:00:00.000Z"),
    });
    const facade = new ReviewRequestFacade({ enqueueReviewPull: vi.fn() } as never);

    await expect(
      facade.generationStatus({ owner: "acme", repo: "widget", number: 7 }),
    ).resolves.toMatchObject({
      jobId: "job-2",
      status: "claimed",
      deduplicated: true,
      analysisStatus: "processing",
    });
  });
});
