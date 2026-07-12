import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardEventHub } from "./board-event-hub.js";
import { PullRequestIndexReconcile } from "./pull-request-index-reconcile.js";

const getById = vi.fn();
const getInstallationById = vi.fn();
const listFolioEnabledWithGithubAccess = vi.fn();
const listOpenByRepoIds = vi.fn();
const deleteByRepoAndNumber = vi.fn();
const pruneClosedOlderThan = vi.fn();

vi.mock("@folio/db", () => ({
  installationsRepo: { getById: (...args: unknown[]) => getInstallationById(...args) },
  pullRequestIndexRepo: {
    deleteByRepoAndNumber: (...args: unknown[]) => deleteByRepoAndNumber(...args),
    listOpenByRepoIds: (...args: unknown[]) => listOpenByRepoIds(...args),
    pruneClosedOlderThan: (...args: unknown[]) => pruneClosedOlderThan(...args),
  },
  repositoriesRepo: {
    getById: (...args: unknown[]) => getById(...args),
    listFolioEnabledWithGithubAccess: (...args: unknown[]) =>
      listFolioEnabledWithGithubAccess(...args),
  },
}));

vi.mock("@folio/github", () => ({ createInstallationOctokit: vi.fn() }));

describe("PullRequestIndexReconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue({
      id: "repo-1",
      installationId: "installation-1",
      owner: "acme",
      name: "widget",
      fullName: "acme/widget",
      folioEnabled: true,
      githubAccessActive: true,
    });
    getInstallationById.mockResolvedValue({
      id: "installation-1",
      githubInstallationId: 123,
      suspendedAt: null,
    });
    listOpenByRepoIds.mockResolvedValue([
      { repoId: "repo-1", githubPrNumber: 2 },
      { repoId: "repo-1", githubPrNumber: 3 },
    ]);
    deleteByRepoAndNumber.mockResolvedValue(undefined);
    pruneClosedOlderThan.mockResolvedValue(0);
    listFolioEnabledWithGithubAccess.mockResolvedValue([{ id: "repo-1" }, { id: "repo-2" }]);
  });

  it("upserts GitHub-only opens and removes index-only opens", async () => {
    const pulls = [githubPull(1), githubPull(2)];
    const octokit = {
      paginate: vi.fn(async () => pulls),
      rest: { pulls: { list: vi.fn() } },
    };
    const writer = { applyPull: vi.fn(async () => undefined) };
    const hub = new BoardEventHub();
    const published = vi.fn();
    hub.subscribe({
      userId: "user-1",
      repoIds: new Set(["repo-1"]),
      send: published,
      close: vi.fn(),
    });
    const reconcile = new PullRequestIndexReconcile(writer as never, hub, {
      octokitFactory: vi.fn(async () => octokit as never),
    });

    const result = await reconcile.runForRepository("repo-1");

    expect(writer.applyPull).toHaveBeenCalledOnce();
    expect(writer.applyPull).toHaveBeenCalledWith({
      repoId: "repo-1",
      owner: "acme",
      repo: "widget",
      pull: pulls[0],
    });
    expect(deleteByRepoAndNumber).toHaveBeenCalledWith("repo-1", 3);
    expect(result).toEqual({ upserted: 1, closed: 1 });
    expect(published).toHaveBeenCalledWith(
      {
        type: "board.invalidate",
        reason: "reconcile",
        repoId: "repo-1",
      },
      expect.any(String),
    );
  });

  it("does not invalidate when the open sets already match", async () => {
    listOpenByRepoIds.mockResolvedValue([{ repoId: "repo-1", githubPrNumber: 2 }]);
    const octokit = {
      paginate: vi.fn(async () => [githubPull(2)]),
      rest: { pulls: { list: vi.fn() } },
    };
    const writer = { applyPull: vi.fn(async () => undefined) };
    const hub = new BoardEventHub();
    const published = vi.fn();
    hub.subscribe({
      userId: "user-1",
      repoIds: new Set(["repo-1"]),
      send: published,
      close: vi.fn(),
    });
    const reconcile = new PullRequestIndexReconcile(writer as never, hub, {
      octokitFactory: vi.fn(async () => octokit as never),
    });

    const result = await reconcile.runForRepository("repo-1");

    expect(result).toEqual({ upserted: 0, closed: 0 });
    expect(published).not.toHaveBeenCalled();
    expect(pruneClosedOlderThan).toHaveBeenCalledOnce();
  });

  it("bounds a reconcile round to the requested repository limit", async () => {
    listOpenByRepoIds.mockResolvedValue([]);
    const octokit = {
      paginate: vi.fn(async () => []),
      rest: { pulls: { list: vi.fn() } },
    };
    const reconcile = new PullRequestIndexReconcile(
      { applyPull: vi.fn(async () => undefined) } as never,
      new BoardEventHub(),
      { octokitFactory: vi.fn(async () => octokit as never) },
    );

    const result = await reconcile.runRound({ limitRepos: 1 });

    expect(result).toEqual({ attempted: 1, failed: 0, upserted: 0, closed: 0 });
    expect(getById).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith("repo-1");
  });
});

function githubPull(number: number) {
  return {
    number,
    title: `PR ${number}`,
    user: { login: "octocat" },
    head: { ref: `feature-${number}`, sha: `sha-${number}` },
    base: { ref: "main" },
    state: "open",
    updated_at: "2026-07-12T00:00:00.000Z",
  };
}
