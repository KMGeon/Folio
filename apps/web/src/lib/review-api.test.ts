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
  prologue: null,
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

const { fetchReview } = await import("./review-api.js");
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

  it("leaves a missing review as a 404 for the confirmation screen", async () => {
    const { ApiError } = await import("./api-client");
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError({} as never, 404));

    await expect(fetchReview("acme", "widget", 7, { cookie: "sid=123" })).rejects.toMatchObject({
      status: 404,
    });

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/pulls/acme/widget/7/review", {
      headers: { cookie: "sid=123" },
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
