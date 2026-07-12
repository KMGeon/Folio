import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chapter } from "@folio/types";

vi.mock("@folio/db", () => ({
  installationsRepo: { upsertByGithubId: vi.fn(async () => ({ id: "inst1" })) },
  repositoriesRepo: {
    getByFullName: vi.fn(async () => null),
    upsertByGithubId: vi.fn(async () => ({ id: "repo1" })),
  },
  pullRequestsRepo: { upsertByRepoAndNumber: vi.fn(async () => ({ id: "pr1" })) },
  revisionsRepo: {
    listByPr: vi.fn(async () => []),
    create: vi.fn(async (input: { rawDiff?: string }) => ({ id: "rev1", index: 0, ...input })),
  },
  chaptersRepo: { replaceForRevision: vi.fn(async () => []) },
}));

const { persistReview, syntheticInstallationId, syntheticRepoId } =
  await import("./review-persistence.js");
const db = await import("@folio/db");

const summary = {
  number: 7,
  title: "Test PR",
  body: null,
  state: "open" as const,
  merged: false,
  draft: false,
  htmlUrl: "https://github.com/acme/widget/pull/7",
  authorLogin: "octocat",
  headRef: "feature",
  headSha: "head123",
  baseRef: "main",
  baseSha: "base123",
  createdAt: "2026-06-20T00:00:00Z",
  updatedAt: "2026-06-20T00:00:00Z",
};

describe("persistReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.repositoriesRepo.getByFullName).mockResolvedValue(null);
  });

  it("uses an existing installed repository before falling back to synthetic ids", async () => {
    vi.mocked(db.repositoriesRepo.getByFullName).mockResolvedValueOnce({
      id: "installed-repo",
      installationId: "real-installation",
      workspaceId: null,
      githubRepoId: 123,
      owner: "acme",
      name: "widget",
      fullName: "acme/widget",
      private: false,
      defaultBranch: "main",
      folioEnabled: true,
      githubAccessActive: true,
      prIndexStatus: "idle" as const,
      prIndexBackfilledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await persistReview({
      owner: "acme",
      repo: "widget",
      summary,
      mergeBaseSha: "base123",
      rawDiff: "diff --git a/a.ts b/a.ts\n",
      prologue: null,
      chapters: [],
    });

    expect(db.installationsRepo.upsertByGithubId).not.toHaveBeenCalled();
    expect(db.repositoriesRepo.upsertByGithubId).not.toHaveBeenCalled();
    expect(db.pullRequestsRepo.upsertByRepoAndNumber).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: "installed-repo" }),
    );
  });

  it("upserts the full chain and stores rawDiff + chapters", async () => {
    const result = await persistReview({
      owner: "acme",
      repo: "widget",
      summary,
      mergeBaseSha: "base123",
      rawDiff: "diff --git a/a.ts b/a.ts\n",
      prologue: null,
      chapters: [
        {
          id: "c1",
          externalId: "chapter-1",
          prId: "",
          revisionId: "",
          order: "0|hzzzzz:" as Chapter["order"],
          title: "Chapter one",
          summary: "does a thing",
          hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
          keyChanges: [],
          reviewHints: [],
          risks: [],
          status: "published",
        },
      ],
    });

    expect(result).toEqual({ prId: "pr1", revisionId: "rev1", revisionIndex: 0 });

    // rawDiff is passed through to the revision insert, and baseSha is the real commit sha.
    expect(db.revisionsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prId: "pr1",
        rawDiff: "diff --git a/a.ts b/a.ts\n",
        baseSha: "base123",
      }),
    );
    // chapters are written for the new revision.
    const [revisionId, rows] = (db.chaptersRepo.replaceForRevision as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(revisionId).toBe("rev1");
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Chapter one");

    // repository upsert must use the per-repo synthetic id, not the installation id.
    expect(db.repositoriesRepo.upsertByGithubId).toHaveBeenCalledWith(
      expect.objectContaining({ githubRepoId: syntheticRepoId("acme", "widget") }),
    );
  });

  it("derives a stable negative synthetic installation id", () => {
    expect(syntheticInstallationId("acme")).toBe(syntheticInstallationId("acme"));
    expect(syntheticInstallationId("acme")).toBeLessThan(0);
  });

  it("derives a stable negative synthetic repo id distinct from the installation id", () => {
    expect(syntheticRepoId("acme", "widget")).toBe(syntheticRepoId("acme", "widget"));
    expect(syntheticRepoId("acme", "widget")).toBeLessThan(0);
    expect(syntheticRepoId("acme", "widget")).not.toBe(syntheticInstallationId("acme"));
  });
});
