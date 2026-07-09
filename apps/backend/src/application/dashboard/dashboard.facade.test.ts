import { beforeEach, describe, expect, it, vi } from "vitest";

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

interface PullFixture {
  number: number;
  title: string;
  user: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  updated_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
}

interface PullDetailFixture {
  additions: number;
  deletions: number;
  changed_files: number;
}

interface OctokitFixture {
  open: PullFixture[];
  closed: PullFixture[];
  details: Record<number, PullDetailFixture>;
  failDetailsFor?: Set<number>;
  failClosedList?: boolean;
}

function openPr({
  number,
  title = `PR ${number}`,
  head = "feat",
}: {
  number: number;
  title?: string;
  head?: string;
}): PullFixture {
  return {
    number,
    title,
    user: { login: "KMGeon" },
    head: { ref: head },
    base: { ref: "main" },
    updated_at: "2026-06-20T00:00:00Z",
  };
}

function closedPr({
  number,
  title = `Completed ${number}`,
  closedAt = "2026-07-08T09:00:00Z",
  mergedAt = null,
}: {
  number: number;
  title?: string;
  closedAt?: string;
  mergedAt?: string | null;
}): PullFixture {
  return {
    number,
    title,
    user: { login: "KMGeon" },
    head: { ref: "feat" },
    base: { ref: "main" },
    updated_at: closedAt,
    closed_at: closedAt,
    merged_at: mergedAt,
  };
}

function octokitWith({ open, closed, details, failDetailsFor, failClosedList }: OctokitFixture) {
  const pulls = {
    list: vi.fn(),
    get: vi.fn(async ({ pull_number }: { pull_number: number }) => {
      if (failDetailsFor?.has(pull_number)) {
        throw new Error("detail failed");
      }
      const detail = details[pull_number];
      if (!detail) {
        return { data: { additions: 0, deletions: 0, changed_files: 0 } };
      }
      return { data: detail };
    }),
  };
  return {
    paginate: vi.fn(async (_list: unknown, options: { state?: "open" | "closed" }) => {
      if (options.state === "closed") {
        if (failClosedList) {
          throw new Error("closed list failed");
        }
        return closed;
      }
      return open;
    }),
    rest: { pulls },
  };
}

describe("DashboardFacade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByAccountLogin.mockResolvedValue([{ id: "i1", githubInstallationId: 111 }]);
    listByInstallation.mockResolvedValue([
      {
        id: "r1",
        owner: "KMGeon",
        name: "Folio",
        fullName: "KMGeon/Folio",
        defaultBranch: "main",
        folioEnabled: true,
      },
    ]);
    getByRepoAndNumber.mockImplementation(async (_repoId: string, n: number) =>
      n === 1 ? { id: "pr1" } : null,
    );
    latestForPr.mockResolvedValue({ id: "rev1" });
    listByRevision.mockResolvedValue([
      { hunkRefs: [{ filePath: "a.ts" }] },
      { hunkRefs: [{ filePath: "b.ts" }, { filePath: "a.ts" }] },
    ]);
    progressForRevision.mockResolvedValue({ viewed: 1, total: 2 });
  });

  it("lists live open PRs with DB review status merged in", async () => {
    const octokit = octokitWith({
      open: [
        openPr({ number: 1, title: "Ready PR" }),
        openPr({ number: 2, title: "Processing PR", head: "wip" }),
      ],
      closed: [],
      details: {
        1: { additions: 10, deletions: 2, changed_files: 3 },
        2: { additions: 4, deletions: 1, changed_files: 1 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.metrics).toEqual({
      ready: 1,
      processing: 1,
      installedRepos: 1,
      activeRepos: 1,
      completed: 0,
    });
    expect(payload.completedPulls).toEqual([]);
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
      additions: 10,
      deletions: 2,
    });

    const processing = payload.pulls.find((p) => p.number === 2);
    expect(processing).toMatchObject({
      status: "processing",
      chapterCount: 0,
      changedFiles: 0,
      additions: 4,
      deletions: 1,
    });
  });

  it("maps closed GitHub pulls into recently completed pulls", async () => {
    const octokit = octokitWith({
      open: [],
      closed: [
        closedPr({ number: 69, title: "Merged PR", mergedAt: "2026-07-08T10:00:00Z" }),
        closedPr({ number: 67, title: "Closed PR", closedAt: "2026-07-08T09:00:00Z" }),
      ],
      details: {
        69: { additions: 81, deletions: 32, changed_files: 4 },
        67: { additions: 3492, deletions: 16, changed_files: 18 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.metrics.completed).toBe(2);
    expect(payload.completedPulls).toEqual([
      expect.objectContaining({
        number: 69,
        title: "Merged PR",
        completedState: "merged",
        additions: 81,
        deletions: 32,
        changedFiles: 4,
      }),
      expect.objectContaining({
        number: 67,
        title: "Closed PR",
        completedState: "closed",
        additions: 3492,
        deletions: 16,
        changedFiles: 18,
      }),
    ]);
  });

  it("sorts completed pulls newest first and caps them at 20", async () => {
    const closed = Array.from({ length: 25 }, (_, index) =>
      closedPr({
        number: index + 1,
        title: `Completed ${index + 1}`,
        mergedAt: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
      }),
    );
    const octokit = octokitWith({ open: [], closed, details: {} });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.completedPulls).toHaveLength(20);
    expect(payload.completedPulls[0]?.number).toBe(25);
    expect(payload.completedPulls.at(-1)?.number).toBe(6);
    expect(payload.metrics.completed).toBe(20);
  });

  it("falls back to zero detail counts when completed pull enrichment fails", async () => {
    const octokit = octokitWith({
      open: [],
      closed: [closedPr({ number: 7, mergedAt: "2026-07-08T10:00:00Z" })],
      details: {},
      failDetailsFor: new Set([7]),
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.completedPulls[0]).toMatchObject({
      number: 7,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    });
  });

  it("keeps open pulls when closed pull fetching fails", async () => {
    const octokit = octokitWith({
      open: [openPr({ number: 1, title: "Ready PR" })],
      closed: [],
      details: { 1: { additions: 10, deletions: 2, changed_files: 3 } },
      failClosedList: true,
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.pulls).toHaveLength(1);
    expect(payload.completedPulls).toEqual([]);
    expect(payload.metrics.completed).toBe(0);
  });

  it("keeps disabled repositories visible when installation tokens cannot be minted", async () => {
    listByInstallation.mockResolvedValueOnce([
      {
        id: "enabled-repo-id",
        owner: "KMGeon",
        name: "Folio",
        fullName: "KMGeon/Folio",
        defaultBranch: "main",
        folioEnabled: true,
      },
      {
        id: "disabled-repo-id",
        owner: "KMGeon",
        name: "disabled",
        fullName: "KMGeon/disabled",
        defaultBranch: "main",
        folioEnabled: false,
      },
    ]);
    const facade = new DashboardFacade({
      octokitFactory: async () => {
        throw new Error("stale installation");
      },
    });
    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });
    expect(payload.pulls).toEqual([]);
    expect(payload.repos).toEqual([
      {
        id: "disabled-repo-id",
        fullName: "KMGeon/disabled",
        openPrCount: 0,
        folioEnabled: false,
      },
    ]);
    expect(payload.metrics).toMatchObject({ installedRepos: 1, activeRepos: 0 });
    expect(payload.metrics.completed).toBe(0);
    expect(payload.completedPulls).toEqual([]);
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
    const octokit = octokitWith({ open: [openPr({ number: 99 })], closed: [], details: {} });
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
    expect(payload.metrics.completed).toBe(0);
    expect(payload.completedPulls).toEqual([]);
  });
});
