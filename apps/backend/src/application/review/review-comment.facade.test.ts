import { describe, expect, it, vi } from "vitest";

const createReviewComment = vi.fn(async () => ({
  id: 321,
  htmlUrl: "https://github.com/acme/widget/pull/7#discussion_r321",
}));
const createInstallationOctokit = vi.fn(async () => ({ rest: { pulls: {} } }));
const createdCommentRow = {
  id: "comment1",
  githubCommentId: 321,
};

vi.mock("@folio/github", () => ({
  createInstallationOctokit,
  createReviewComment,
}));

vi.mock("@folio/db", () => ({
  repositoriesRepo: {
    getByFullName: vi.fn(async () => ({
      id: "repo1",
      installationId: "inst1",
      owner: "acme",
      name: "widget",
    })),
  },
  pullRequestsRepo: {
    getByRepoAndNumber: vi.fn(async () => ({
      id: "pr1",
      headSha: "head123",
    })),
  },
  revisionsRepo: {
    latestForPr: vi.fn(async () => ({ id: "rev1" })),
  },
  chaptersRepo: {
    listByRevision: vi.fn(async () => [{ id: "chapter1" }]),
  },
  installationsRepo: {
    getById: vi.fn(async () => ({ githubInstallationId: 141535463 })),
  },
  commentsRepo: {
    create: vi.fn(async () => createdCommentRow),
  },
}));

const { ReviewCommentFacade } = await import("./review-comment.facade.js");

describe("ReviewCommentFacade", () => {
  it("creates a GitHub inline comment and persists the Folio comment row", async () => {
    const db = await import("@folio/db");
    const facade = new ReviewCommentFacade();

    const result = await facade.createInlineComment({
      owner: "acme",
      repo: "widget",
      number: 7,
      chapterIndex: 1,
      path: "src/a.ts",
      side: "RIGHT",
      line: 12,
      body: "확인이 필요합니다.",
      authorLogin: "octocat",
    });

    expect(createInstallationOctokit).toHaveBeenCalledWith(141535463);
    expect(createReviewComment).toHaveBeenCalledWith(
      expect.anything(),
      { owner: "acme", repo: "widget", number: 7 },
      {
        body: "확인이 필요합니다.",
        commitSha: "head123",
        path: "src/a.ts",
        side: "RIGHT",
        line: 12,
      },
    );
    expect(db.commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prId: "pr1",
        revisionId: "rev1",
        chapterId: "chapter1",
        authorLogin: "octocat",
        body: "확인이 필요합니다.",
        githubCommentId: 321,
        source: "folio",
        lineRef: {
          filePath: "src/a.ts",
          side: "additions",
          startLine: 12,
          endLine: 12,
        },
      }),
    );
    expect(result).toEqual({
      id: "comment1",
      githubCommentId: 321,
      htmlUrl: "https://github.com/acme/widget/pull/7#discussion_r321",
    });
  });
});
