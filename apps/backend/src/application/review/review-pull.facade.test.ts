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
                  base: { ref: "main" },
                  created_at: "x",
                  updated_at: "y",
                },
              },
        ),
      },
      issues: {
        listComments,
        createComment,
        updateComment,
      },
    },
    // listIssueComments uses client.paginate internally; return empty array so
    // upsertMarkedComment falls through to createComment on first run.
    paginate: vi.fn(async () => []),
  };
}

describe("ReviewPullFacade", () => {
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

  it("treats a comment failure as non-fatal", async () => {
    const octokit = fakeOctokit();
    octokit.rest.issues.createComment = vi.fn(async () => {
      throw new Error("no write access");
    });
    const facade = new ReviewPullFacade({
      octokitFactory: () => octokit as never,
      persist: vi.fn(async () => ({ prId: "pr1", revisionId: "rev1", revisionIndex: 0 })),
    });

    const result = await facade.run({ owner: "acme", repo: "widget", number: 7 });
    expect(result.commentUrl).toBeNull();
    expect(result.commentError).toContain("no write access");
  });
});
