import { describe, expect, it, vi } from "vitest";

vi.mock("./api-client", () => ({
  apiRequest: vi.fn(async () => ({
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
  })),
}));

const { fetchReview } = await import("./review-api.js");
const { apiRequest } = await import("./api-client");

describe("fetchReview", () => {
  it("requests the review endpoint by org/repo/number", async () => {
    const payload = await fetchReview("acme", "widget", 7);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/pulls/acme/widget/7/review");
    expect(payload.chapters[0]?.title).toBe("C1");
  });
});
