import type { Octokit } from "octokit";
import { describe, expect, it, vi } from "vitest";
import {
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  getReviews,
  listPullRequestFiles,
} from "../pull-request.js";

const REF = { owner: "acme", repo: "widgets", number: 5 };

/** Minimal fake Octokit covering only the methods exercised here. */
function fakeOctokit(overrides: {
  get?: ReturnType<typeof vi.fn>;
  paginate?: ReturnType<typeof vi.fn>;
  listFiles?: unknown;
  listReviews?: unknown;
  listCommits?: unknown;
}): Octokit {
  return {
    rest: {
      pulls: {
        get: overrides.get ?? vi.fn(),
        listFiles: overrides.listFiles ?? "listFiles-endpoint",
        listReviews: overrides.listReviews ?? "listReviews-endpoint",
        listCommits: overrides.listCommits ?? "listCommits-endpoint",
      },
    },
    paginate: overrides.paginate ?? vi.fn(),
  } as unknown as Octokit;
}

describe("getPullRequest", () => {
  it("normalizes the REST PR onto PullRequestSummary", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        number: 5,
        title: "Add feature",
        body: null,
        state: "open",
        merged: false,
        draft: true,
        html_url: "https://github.com/acme/widgets/pull/5",
        user: { login: "alice" },
        head: { ref: "feat", sha: "abc123" },
        base: { ref: "main", sha: "base456" },
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-02T00:00:00Z",
      },
    });
    const client = fakeOctokit({ get });
    const summary = await getPullRequest(client, REF);
    expect(summary).toMatchObject({
      number: 5,
      draft: true,
      authorLogin: "alice",
      headSha: "abc123",
      baseRef: "main",
      baseSha: "base456",
    });
  });
});

describe("getPullRequestDiff", () => {
  it("requests the diff media type and returns the raw string", async () => {
    const diffText = "diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n";
    const get = vi.fn().mockResolvedValue({ data: diffText });
    const client = fakeOctokit({ get });
    const diff = await getPullRequestDiff(client, REF);
    expect(diff).toBe(diffText);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ mediaType: { format: "diff" } }));
  });
});

describe("listPullRequestFiles", () => {
  it("paginates beyond 100 files", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      filename: `f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: "@@",
    }));
    const page2 = [
      {
        filename: "f100.ts",
        status: "added",
        additions: 2,
        deletions: 0,
        changes: 2,
        patch: "@@",
        previous_filename: undefined,
      },
    ];
    const paginate = vi.fn().mockResolvedValue([...page1, ...page2]);
    const client = fakeOctokit({ paginate });
    const files = await listPullRequestFiles(client, REF);
    expect(files).toHaveLength(101);
    expect(files[100]?.filename).toBe("f100.ts");
    expect(paginate).toHaveBeenCalledWith(
      "listFiles-endpoint",
      expect.objectContaining({ per_page: 100, pull_number: 5 }),
    );
  });
});

describe("getPullRequestCommits", () => {
  it("paginates and maps commits onto {sha, message}", async () => {
    const paginate = vi.fn().mockResolvedValue([
      {
        sha: "aaa111",
        commit: { message: "feat: first\n\nbody", author: { date: "2026-06-01T00:00:00Z" } },
        author: { login: "alice" },
        parents: [{ sha: "parent1" }],
      },
      {
        sha: "bbb222",
        commit: { message: "fix: second", author: { name: "Bob", date: "2026-06-02T00:00:00Z" } },
      },
    ]);
    const client = fakeOctokit({ paginate });
    const commits = await getPullRequestCommits(client, REF);
    expect(commits).toEqual([
      {
        sha: "aaa111",
        message: "feat: first\n\nbody",
        author: "alice",
        authoredAt: "2026-06-01T00:00:00Z",
        parents: ["parent1"],
      },
      {
        sha: "bbb222",
        message: "fix: second",
        author: "Bob",
        authoredAt: "2026-06-02T00:00:00Z",
        parents: [],
      },
    ]);
    expect(paginate).toHaveBeenCalledWith(
      "listCommits-endpoint",
      expect.objectContaining({ owner: "acme", repo: "widgets", pull_number: 5, per_page: 100 }),
    );
  });
});

describe("getReviews", () => {
  it("maps GitHub states onto @folio/types ReviewState", async () => {
    const paginate = vi.fn().mockResolvedValue([
      { id: 1, user: { login: "bob" }, state: "APPROVED", submitted_at: "t", commit_id: "c1" },
      {
        id: 2,
        user: { login: "carol" },
        state: "CHANGES_REQUESTED",
        submitted_at: "t",
        commit_id: "c1",
      },
      { id: 3, user: null, state: "WEIRD_STATE", submitted_at: null, commit_id: null },
    ]);
    const client = fakeOctokit({ paginate });
    const reviews = await getReviews(client, REF);
    expect(reviews[0]?.state).toBe("APPROVED");
    expect(reviews[1]?.state).toBe("CHANGES_REQUESTED");
    // Unknown state maps to null rather than throwing.
    expect(reviews[2]?.state).toBeNull();
    expect(reviews[2]?.reviewerLogin).toBeNull();
  });
});
