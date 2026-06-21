import { describe, expect, it, vi } from "vitest";

vi.mock("@folio/db", () => ({
  repositoriesRepo: {
    getByFullName: vi.fn(async () => ({
      id: "repo1",
      installationId: "inst1",
      owner: "acme",
      name: "widget",
    })),
  },
  installationsRepo: {
    getById: vi.fn(async () => ({ githubInstallationId: 123456 })),
  },
  pullRequestsRepo: {
    getByRepoAndNumber: vi.fn(async () => ({
      id: "pr1",
      title: "PR",
      body: "## Summary\n\n- Body",
      headSha: "head123",
      baseRef: "main",
      headRef: "feat",
    })),
  },
  revisionsRepo: {
    latestForPr: vi.fn(async () => ({
      id: "rev1",
      rawDiff: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n a\n+b\n",
    })),
  },
  chaptersRepo: {
    listByRevision: vi.fn(async () => [
      {
        id: "ch1",
        title: "C1",
        summary: "s",
        order: "0|a:",
        hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
      },
    ]),
  },
  reviewStateRepo: {
    viewedForRevision: vi.fn(async () => ({ filePaths: [], chapterIds: ["ch1"] })),
  },
}));

vi.mock("@folio/github", () => ({
  createInstallationOctokit: vi.fn(async () => ({ rest: {} })),
  getRepositoryCommits: vi.fn(async () => []),
  getPullRequestCommits: vi.fn(async () => []),
  listIssueComments: vi.fn(async () => [
    {
      id: 101,
      body: "Looks good\n\n<!-- folio:review-summary -->",
      user: "alice",
      createdAt: "2026-06-21T00:00:00Z",
      htmlUrl: "https://github.com/acme/widget/pull/7#issuecomment-101",
    },
  ]),
}));

const { ReviewReadFacade } = await import("./review-read.facade.js");

describe("ReviewReadFacade", () => {
  it("assembles pr meta + chapters with sliced code", async () => {
    const facade = new ReviewReadFacade();
    const payload = await facade.getReview("acme", "widget", 7, "user1");
    expect(payload).not.toBeNull();
    expect(payload?.pr.title).toBe("PR");
    expect(payload?.pr.body).toContain("Summary");
    expect(payload?.comments).toEqual([
      {
        id: 101,
        body: "Looks good",
        author: "alice",
        createdAt: "2026-06-21T00:00:00Z",
        htmlUrl: "https://github.com/acme/widget/pull/7#issuecomment-101",
      },
    ]);
    expect(payload?.chapters).toHaveLength(1);
    expect(payload!.chapters[0]!.index).toBe(1);
    expect(payload!.chapters[0]!.diffLines.length).toBeGreaterThan(0);
    expect(payload!.chapters[0]!.viewed).toBe(true);
  });

  it("returns null when the pr is unknown", async () => {
    const db = await import("@folio/db");
    (db.pullRequestsRepo.getByRepoAndNumber as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );
    const facade = new ReviewReadFacade();
    expect(await facade.getReview("acme", "widget", 999, "user1")).toBeNull();
  });
});
