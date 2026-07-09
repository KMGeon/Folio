import { beforeEach, describe, expect, it, vi } from "vitest";

const createReviewComment = vi.fn(async () => ({
  id: 321,
  htmlUrl: "https://github.com/acme/widget/pull/7#discussion_r321",
}));
const createInstallationOctokit = vi.fn(async () => ({ rest: { pulls: {} } }));
const createdCommentRow = {
  id: "comment1",
  githubCommentId: 321,
};
const rawDiff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,2 +10,3 @@
 const before = true;
+const added = true;
 const after = true;
`;

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
    latestForPr: vi.fn(async () => ({ id: "rev1", rawDiff })),
  },
  chaptersRepo: {
    listByRevision: vi.fn(async () => [
      { id: "chapter1", hunkRefs: [{ filePath: "src/a.ts", oldStart: 10 }] },
    ]),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("rejects targets outside the selected chapter before creating a GitHub comment", async () => {
    const db = await import("@folio/db");
    const facade = new ReviewCommentFacade();

    const result = await facade.createInlineComment({
      owner: "acme",
      repo: "widget",
      number: 7,
      chapterIndex: 1,
      path: "src/other.ts",
      side: "RIGHT",
      line: 11,
      body: "잘못된 대상입니다.",
      authorLogin: "octocat",
    });

    expect(result).toBeNull();
    expect(createInstallationOctokit).not.toHaveBeenCalled();
    expect(createReviewComment).not.toHaveBeenCalled();
    expect(db.commentsRepo.create).not.toHaveBeenCalled();
  });

  it("surfaces DB persistence failures after GitHub creates the comment", async () => {
    const db = await import("@folio/db");
    vi.mocked(db.commentsRepo.create).mockRejectedValueOnce(new Error("db down"));
    const facade = new ReviewCommentFacade();

    await expect(
      facade.createInlineComment({
        owner: "acme",
        repo: "widget",
        number: 7,
        chapterIndex: 1,
        path: "src/a.ts",
        side: "RIGHT",
        line: 11,
        body: "확인이 필요합니다.",
        authorLogin: "octocat",
      }),
    ).rejects.toThrow("db down");

    expect(createReviewComment).toHaveBeenCalled();
  });
});
