import { describe, expect, it, vi } from "vitest";

vi.mock("@folio/db", () => ({
  repositoriesRepo: {
    getByGithubId: vi.fn(async () => ({ id: "repo1", owner: "acme", name: "widget" })),
  },
  pullRequestsRepo: {
    getByRepoAndNumber: vi.fn(async () => ({
      id: "pr1",
      title: "PR",
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
      { title: "C1", summary: "s", order: "0|a:", hunkRefs: [{ filePath: "a.ts", oldStart: 1 }] },
    ]),
  },
}));

const { ReviewReadFacade } = await import("./review-read.facade.js");

describe("ReviewReadFacade", () => {
  it("assembles pr meta + chapters with sliced code", async () => {
    const facade = new ReviewReadFacade();
    const payload = await facade.getReview("acme", "widget", 7);
    expect(payload?.pr.title).toBe("PR");
    expect(payload?.chapters).toHaveLength(1);
    expect(payload?.chapters[0].index).toBe(1);
    expect(payload?.chapters[0].diffLines.length).toBeGreaterThan(0);
  });

  it("returns null when the pr is unknown", async () => {
    const db = await import("@folio/db");
    (db.pullRequestsRepo.getByRepoAndNumber as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );
    const facade = new ReviewReadFacade();
    expect(await facade.getReview("acme", "widget", 999)).toBeNull();
  });
});
