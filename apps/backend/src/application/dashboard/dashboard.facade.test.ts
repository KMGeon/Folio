import { describe, expect, it, vi } from "vitest";

const listByAccountLogin = vi.fn(async () => [{ id: "i1", githubInstallationId: 111 }]);
const listByInstallation = vi.fn(async () => [
  {
    id: "r1",
    owner: "KMGeon",
    name: "Folio",
    fullName: "KMGeon/Folio",
    defaultBranch: "main",
    folioEnabled: true,
  },
]);
const getByRepoAndNumber = vi.fn(async (_repoId: string, n: number) =>
  n === 1 ? { id: "pr1" } : null,
);
const latestForPr = vi.fn(async () => ({ id: "rev1" }));
const listByRevision = vi.fn(async () => [
  { hunkRefs: [{ filePath: "a.ts" }] },
  { hunkRefs: [{ filePath: "b.ts" }, { filePath: "a.ts" }] },
]);
const progressForRevision = vi.fn(async () => ({ viewed: 1, total: 2 }));

vi.mock("@folio/db", () => ({
  installationsRepo: { listByAccountLogin },
  repositoriesRepo: { listByInstallation },
  pullRequestsRepo: { getByRepoAndNumber },
  revisionsRepo: { latestForPr },
  chaptersRepo: { listByRevision },
  reviewStateRepo: { progressForRevision },
}));
vi.mock("@folio/github", () => ({ createInstallationOctokit: vi.fn() }));
vi.mock("../../infrastructure/github/github-contributions.js", () => ({
  fetchPublicContributions: vi.fn(async () => [{ date: "2026-06-20", count: 3 }]),
}));

const { DashboardFacade } = await import("./dashboard.facade.js");

function octokitWith(prs: unknown[]) {
  return {
    paginate: vi.fn(async () => prs),
    rest: { pulls: { list: "list-fn" } },
  };
}

describe("DashboardFacade", () => {
  it("lists live open PRs with DB review status merged in", async () => {
    const octokit = octokitWith([
      {
        number: 1,
        title: "Ready PR",
        user: { login: "KMGeon" },
        head: { ref: "feat" },
        base: { ref: "main" },
        updated_at: "2026-06-20T00:00:00Z",
      },
      {
        number: 2,
        title: "Processing PR",
        user: { login: "KMGeon" },
        head: { ref: "wip" },
        base: { ref: "main" },
        updated_at: "2026-06-20T00:00:00Z",
      },
    ]);
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.metrics).toEqual({
      ready: 1,
      processing: 1,
      installedRepos: 1,
      activeRepos: 1,
    });
    expect(payload.repos).toEqual([
      { id: "r1", fullName: "KMGeon/Folio", openPrCount: 2, folioEnabled: true },
    ]);
    // Activity comes from the user's public GitHub contributions.
    expect(payload.activity).toEqual([{ date: "2026-06-20", count: 3 }]);

    const ready = payload.pulls.find((p) => p.number === 1);
    expect(ready).toMatchObject({
      org: "KMGeon",
      repo: "Folio",
      status: "ready",
      chapterCount: 2,
      viewedChapters: 1,
      changedFiles: 2, // a.ts + b.ts, deduped across chapters
      title: "Ready PR",
    });

    const processing = payload.pulls.find((p) => p.number === 2);
    expect(processing).toMatchObject({ status: "processing", chapterCount: 0, changedFiles: 0 });
  });

  it("skips installations whose token cannot be minted", async () => {
    const facade = new DashboardFacade({
      octokitFactory: async () => {
        throw new Error("stale installation");
      },
    });
    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });
    expect(payload.pulls).toEqual([]);
    expect(payload.metrics.installedRepos).toBe(0);
  });

  it("keeps disabled repositories visible without fetching their pull requests", async () => {
    listByInstallation.mockResolvedValueOnce([
      {
        id: "disabled-repo-id",
        owner: "KMGeon",
        name: "disabled",
        fullName: "KMGeon/disabled",
        defaultBranch: "main",
        folioEnabled: false,
      },
    ]);
    const octokit = octokitWith([{ number: 99 }]);
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(octokit.paginate).not.toHaveBeenCalled();
    expect(payload.repos).toContainEqual({
      id: "disabled-repo-id",
      fullName: "KMGeon/disabled",
      openPrCount: 0,
      folioEnabled: false,
    });
    expect(payload.pulls.some((pull) => pull.repo === "disabled")).toBe(false);
    expect(payload.metrics).toMatchObject({ installedRepos: 1, activeRepos: 0 });
  });
});
