import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewPayload = {
  pr: {
    org: "acme",
    repo: "widget",
    number: 7,
    title: "PR",
    headSha: "h",
    baseBranch: "main",
    headBranch: "feat",
  },
  chapters: [{ index: 1, title: "C1", summary: "s", files: [], diffLines: [] }],
  comments: [],
  commits: [],
  commitsTruncated: false,
};

vi.mock("./api-client", () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;

    constructor(_response: unknown, status: number) {
      super("api error");
      this.status = status;
    }
  },
  apiRequest: vi.fn(async () => reviewPayload),
}));

const { fetchReview, fetchReviewOrCreate } = await import("./review-api.js");
const { apiRequest } = await import("./api-client");

describe("fetchReview", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue(reviewPayload);
  });

  it("requests the review endpoint by org/repo/number", async () => {
    const payload = await fetchReview("acme", "widget", 7);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/pulls/acme/widget/7/review");
    expect(payload.chapters[0]?.title).toBe("C1");
  });

  it("creates and refetches the review when the first read returns 404", async () => {
    const { ApiError } = await import("./api-client");
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new ApiError({} as never, 404))
      .mockResolvedValueOnce({
        prId: "pr-1",
        revisionId: "rev-1",
        chapters: [],
        commentUrl: null,
      })
      .mockResolvedValueOnce(reviewPayload);

    const payload = await fetchReviewOrCreate("acme", "widget", 7, { cookie: "sid=123" });

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/pulls/acme/widget/7/review", {
      headers: { cookie: "sid=123" },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/pulls", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sid=123" },
      body: JSON.stringify({ owner: "acme", repo: "widget", number: 7 }),
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, "/api/v1/pulls/acme/widget/7/review", {
      headers: { cookie: "sid=123" },
    });
    expect(payload.chapters[0]?.title).toBe("C1");
  });
});
