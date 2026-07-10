import { describe, expect, it, vi } from "vitest";

const storedPrologue = {
  motivation: "리뷰 흐름을 더 빠르게 이해하기 위해 변경합니다.",
  outcome: "PR 전체 요약과 검토 지점을 한 화면에서 확인합니다.",
  keyChanges: [
    { summary: "PR 요약 노출", description: "저장된 총정리를 리뷰 화면에 전달합니다." },
    { summary: "안전한 폴백", description: "잘못된 총정리는 기존 설명 화면으로 전환합니다." },
  ],
  focusAreas: [
    {
      type: "architecture",
      severity: "medium",
      title: "API 계약",
      description: "저장 데이터와 응답 계약이 일치하는지 확인하세요.",
      locations: ["apps/backend/src/application/review/review-read.facade.ts"],
    },
  ],
  complexity: { level: "medium", reasoning: "백엔드와 웹 계약이 함께 바뀝니다." },
};

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
      prologue: storedPrologue,
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
        keyChanges: [
          {
            id: "chapter-1-kc-1",
            externalId: "chapter-1-kc-1",
            content: "이 변경이 API 계약을 깨지 않는지 확인해야 할까요?",
            lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 2, endLine: 2 }],
          },
        ],
      },
    ]),
  },
  reviewStateRepo: {
    viewedForRevision: vi.fn(async () => ({ filePaths: ["a.ts"], chapterIds: ["ch1"] })),
    keyChangesViewedForChapters: vi.fn(async () => new Map([["ch1", new Set(["chapter-1-kc-1"])]])),
  },
}));

vi.mock("@folio/github", () => ({
  createInstallationOctokit: vi.fn(async () => ({ rest: {} })),
  getRepositoryCommits: vi.fn(async () => ({ commits: [], hasMore: true })),
  getPullRequestCommits: vi.fn(async () => []),
  listIssueComments: vi.fn(async () => [
    {
      id: 101,
      body: "Looks good\n\n<!-- folio:review-summary -->",
      user: "alice",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
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
    expect(payload?.prologue).toEqual({ ...storedPrologue, diagram: null });
    expect(payload?.comments).toEqual([
      {
        id: 101,
        body: "Looks good",
        author: "alice",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        createdAt: "2026-06-21T00:00:00Z",
        htmlUrl: "https://github.com/acme/widget/pull/7#issuecomment-101",
      },
    ]);
    expect(payload?.chapters).toHaveLength(1);
    expect(payload!.chapters[0]!.index).toBe(1);
    expect(payload!.chapters[0]!.diffLines.length).toBeGreaterThan(0);
    expect(payload!.chapters[0]!.viewed).toBe(true);
    expect(payload!.chapters[0]!.files[0]).toMatchObject({ path: "a.ts", viewed: true });
    expect(payload!.chapters[0]!.keyChanges).toEqual([
      {
        id: "chapter-1-kc-1",
        content: "이 변경이 API 계약을 깨지 않는지 확인해야 할까요?",
        lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 2, endLine: 2 }],
        viewed: true,
      },
    ]);
    expect(payload!.commitsTruncated).toBe(true);
  });

  it("returns null for invalid stored prologue without failing review", async () => {
    const db = await import("@folio/db");
    vi.mocked(db.revisionsRepo.latestForPr).mockResolvedValueOnce({
      id: "rev-invalid",
      rawDiff: "",
      prologue: { complexity: { level: "extreme" } },
    } as never);

    const payload = await new ReviewReadFacade().getReview("acme", "widget", 7, "user1");

    expect(payload).not.toBeNull();
    expect(payload?.prologue).toBeNull();
  });

  it("returns null when no prologue is stored", async () => {
    const db = await import("@folio/db");
    vi.mocked(db.revisionsRepo.latestForPr).mockResolvedValueOnce({
      id: "rev-null",
      rawDiff: "",
      prologue: null,
    } as never);

    const payload = await new ReviewReadFacade().getReview("acme", "widget", 7, "user1");

    expect(payload?.prologue).toBeNull();
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
