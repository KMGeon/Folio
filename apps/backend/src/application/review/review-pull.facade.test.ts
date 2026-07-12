import { describe, expect, it, vi } from "vitest";
import { ReviewPullFacade } from "./review-pull.facade.js";

// Minimal fake octokit: PR get + diff get + issue comment list/create.
// `paginate` is needed by listIssueComments inside upsertMarkedComment.
function fakeOctokit() {
  const listComments = vi.fn(async () => ({ data: [] }));
  const createComment = vi.fn(async () => ({ data: { id: 1, html_url: "https://c/1" } }));
  const updateComment = vi.fn(async () => ({ data: { id: 1 } }));

  return {
    rest: {
      pulls: {
        get: vi.fn(async (opts: { mediaType?: { format: string } }) =>
          opts.mediaType?.format === "diff"
            ? { data: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n a\n+b\n" }
            : {
                data: {
                  number: 7,
                  title: "PR",
                  body: null,
                  state: "open",
                  merged: false,
                  draft: false,
                  html_url: "https://github.com/acme/widget/pull/7",
                  user: { login: "octocat" },
                  head: { ref: "feat", sha: "h1" },
                  base: { ref: "main", sha: "b1" },
                  created_at: "x",
                  updated_at: "y",
                },
              },
        ),
        listCommits: "listCommits-endpoint",
      },
      issues: {
        listComments,
        createComment,
        updateComment,
      },
    },
    // Branch paginate by endpoint: commits return a sample; issue comments return [].
    paginate: vi.fn(async (endpoint: unknown) =>
      endpoint === "listCommits-endpoint"
        ? [{ sha: "c1", commit: { message: "feat: do a thing" } }]
        : [],
    ),
  };
}

describe("ReviewPullFacade", () => {
  it("uses the repository GitHub App installation when no Octokit is injected", async () => {
    vi.resetModules();
    const octokit = fakeOctokit();
    const createInstallationOctokit = vi.fn(async () => octokit);
    vi.doMock("@folio/db", () => ({
      repositoriesRepo: {
        getByFullName: vi.fn(async () => ({ installationId: "inst-db-id" })),
      },
      installationsRepo: {
        getById: vi.fn(async () => ({ githubInstallationId: 123456 })),
      },
    }));
    vi.doMock("@folio/github", async () => {
      const actual = (await vi.importActual("@folio/github")) as Record<string, unknown>;
      return { ...actual, createInstallationOctokit };
    });
    const { ReviewPullFacade: Facade } = await import("./review-pull.facade.js");
    const facade = new Facade({
      persist: vi.fn(async () => ({ prId: "pr1", revisionId: "rev1", revisionIndex: 0 })),
      decomposeDeps: {
        clientFactory: () => ({
          model: "stub",
          emitChapters: async () => ({
            chapters: [
              {
                id: "chapter-1",
                order: 1,
                title: "All changes",
                summary: "x",
                hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
                keyChanges: [],
              },
            ],
          }),
        }),
      },
    });

    await facade.run({ owner: "acme", repo: "widget", number: 7 });

    expect(createInstallationOctokit).toHaveBeenCalledWith(123456);
  });

  it("decomposes, persists, and reports a comment url", async () => {
    const octokit = fakeOctokit();
    const persistReview = vi.fn(async () => ({
      prId: "pr1",
      revisionId: "rev1",
      revisionIndex: 0,
    }));
    const facade = new ReviewPullFacade({
      octokitFactory: () => octokit as never,
      persist: persistReview,
      getRepositoryPreference: async () => ({ aiReplyEnabled: true }),
      decomposeDeps: {
        clientFactory: () => ({
          model: "stub",
          emitChapters: async () => ({
            chapters: [
              {
                id: "chapter-1",
                order: 1,
                title: "All changes",
                summary: "x",
                hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
                keyChanges: [],
              },
            ],
          }),
        }),
      },
    });

    const result = await facade.run({ owner: "acme", repo: "widget", number: 7 });

    expect(persistReview).toHaveBeenCalledOnce();
    expect(result.chapters.length).toBeGreaterThan(0);
    // URL is assembled from summary.htmlUrl + issuecomment id returned by upsertMarkedComment.
    expect(result.commentUrl).toBe("https://github.com/acme/widget/pull/7#issuecomment-1");
    expect(result.commentError).toBeNull();
  });

  it("persists a review without publishing the automatic chapter comment when replies are disabled", async () => {
    const octokit = fakeOctokit();
    const persistReview = vi.fn(async () => ({
      prId: "pr1",
      revisionId: "rev1",
      revisionIndex: 0,
    }));
    const facade = new ReviewPullFacade({
      octokitFactory: () => octokit as never,
      persist: persistReview,
      decomposeDeps: decompositionDeps(),
      ...({ getRepositoryPreference: async () => ({ aiReplyEnabled: false }) } as object),
    } as never);

    const result = await facade.run({ owner: "acme", repo: "widget", number: 7 });

    expect(persistReview).toHaveBeenCalledOnce();
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ commentUrl: null, commentError: null });
  });

  it("treats a comment failure as non-fatal", async () => {
    const octokit = fakeOctokit();
    octokit.rest.issues.createComment = vi.fn(async () => {
      throw new Error("no write access");
    });
    const facade = new ReviewPullFacade({
      octokitFactory: () => octokit as never,
      persist: vi.fn(async () => ({ prId: "pr1", revisionId: "rev1", revisionIndex: 0 })),
      getRepositoryPreference: async () => ({ aiReplyEnabled: true }),
      // Stub decomposition so the test never depends on a real model client;
      // chapter content is irrelevant.
      decomposeDeps: {
        clientFactory: () => ({
          model: "stub",
          emitChapters: async () => ({
            chapters: [
              {
                id: "chapter-1",
                order: 1,
                title: "All changes",
                summary: "x",
                hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
                keyChanges: [],
              },
            ],
          }),
        }),
      },
    });

    const result = await facade.run({ owner: "acme", repo: "widget", number: 7 });
    expect(result.commentUrl).toBeNull();
    expect(result.commentError).toContain("no write access");
    // Verify persisted ids and chapters survive the non-fatal comment failure.
    expect(result.prId).toBe("pr1");
    expect(result.revisionId).toBe("rev1");
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it("passes PR commit messages into the decomposition prompt", async () => {
    const octokit = fakeOctokit();
    let seenUserPrompt = "";
    const facade = new ReviewPullFacade({
      octokitFactory: () => octokit as never,
      persist: vi.fn(async () => ({ prId: "pr1", revisionId: "rev1", revisionIndex: 0 })),
      getRepositoryPreference: async () => ({ aiReplyEnabled: true }),
      decomposeDeps: {
        clientFactory: () => ({
          model: "stub",
          emitChapters: async (req: { messages: { content: string }[] }) => {
            seenUserPrompt = req.messages[0]?.content ?? "";
            return {
              chapters: [
                {
                  id: "chapter-1",
                  order: 1,
                  title: "All changes",
                  summary: "x",
                  hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
                  keyChanges: [],
                },
              ],
            };
          },
        }),
      },
    });
    await facade.run({ owner: "acme", repo: "widget", number: 7 });
    expect(seenUserPrompt).toContain("feat: do a thing");
  });
});

function decompositionDeps() {
  return {
    clientFactory: () => ({
      model: "stub",
      emitChapters: async () => ({
        chapters: [
          {
            id: "chapter-1",
            order: 1,
            title: "All changes",
            summary: "x",
            hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
            keyChanges: [],
          },
        ],
      }),
    }),
  };
}
