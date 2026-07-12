import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardEventHub } from "./board-event-hub.js";
import { PullRequestIndexWriter } from "./pull-request-index-writer.js";

const upsert = vi.fn();
const deleteByRepo = vi.fn();

vi.mock("@folio/db", () => ({
  PR_INDEX_GITHUB_STATE: { OPEN: "open", CLOSED: "closed" },
  pullRequestIndexRepo: {
    upsert: (...args: unknown[]) => upsert(...args),
    deleteByRepo: (...args: unknown[]) => deleteByRepo(...args),
  },
  repositoriesRepo: {
    getByFullName: vi.fn(),
  },
}));

describe("PullRequestIndexWriter", () => {
  beforeEach(() => {
    upsert.mockReset();
    deleteByRepo.mockReset();
  });

  it("upserts open PR meta and publishes pr.upserted", async () => {
    const hub = new BoardEventHub();
    const published: string[] = [];
    hub.subscribe({
      userId: "u1",
      repoIds: new Set(["repo-1"]),
      send: (event) => {
        if (event.type === "pr.upserted") {
          published.push(event.id);
        }
      },
      close: vi.fn(),
    });

    const now = new Date("2026-07-12T00:00:00.000Z");
    upsert.mockResolvedValue({
      repoId: "repo-1",
      githubPrNumber: 9,
      title: "feat",
      authorLogin: "alice",
      isDraft: false,
      githubState: "open",
      githubUpdatedAt: now,
      additions: 1,
      deletions: 2,
      changedFiles: 3,
    });

    const writer = new PullRequestIndexWriter(hub);
    await writer.applyPull({
      repoId: "repo-1",
      owner: "acme",
      repo: "widget",
      pull: {
        number: 9,
        title: "feat",
        user: { login: "alice" },
        head: { ref: "feat", sha: "abc" },
        base: { ref: "main" },
        draft: false,
        state: "open",
        updated_at: now.toISOString(),
        html_url: "https://github.com/acme/widget/pull/9",
        additions: 1,
        deletions: 2,
        changed_files: 3,
        labels: [{ name: "bug", color: "f00" }],
      },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "repo-1",
        githubPrNumber: 9,
        title: "feat",
        authorLogin: "alice",
        githubState: "open",
        labelsJson: [{ name: "bug", color: "f00" }],
      }),
    );
    expect(published).toEqual(["acme-widget-9"]);
  });

  it("clears a repo index and invalidates the board", async () => {
    const hub = new BoardEventHub();
    const reasons: string[] = [];
    hub.subscribe({
      userId: "u1",
      repoIds: new Set(["repo-1"]),
      send: (event) => {
        if (event.type === "board.invalidate") {
          reasons.push(event.reason);
        }
      },
      close: vi.fn(),
    });
    deleteByRepo.mockResolvedValue(undefined);

    const writer = new PullRequestIndexWriter(hub);
    await writer.clearRepo("repo-1");

    expect(deleteByRepo).toHaveBeenCalledWith("repo-1");
    expect(reasons).toEqual(["repo_scope_changed"]);
  });
});
