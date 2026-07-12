import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closedPr,
  octokitWith,
  openPr,
  type PullFixture,
  repoRow,
} from "./dashboard-facade-test-fixtures.js";
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
const loadDashboardWorkspaceScope = vi.fn(async () => ({
  workspace: { id: "workspace-1", githubAccountId: 42 },
  installations: await listByAccountLogin(),
  repositories: (await listByInstallation()).map((repository) => ({
    ...repository,
    installationId: "i1",
  })),
}));
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
vi.mock("../../config.js", () => ({ config: { DASHBOARD_READ_FROM_INDEX: false } }));
vi.mock("../../infrastructure/github/github-contributions.js", () => ({
  fetchPublicContributions: vi.fn(async () => [{ date: "2026-06-20", count: 3 }]),
}));
vi.mock("./dashboard-workspace-scope.js", () => ({ loadDashboardWorkspaceScope }));

const { DashboardFacade } = await import("./dashboard.facade.js");
const { clearDashboardGithubCache } = await import("./dashboard-github-cache.js");

describe("DashboardFacade", () => {
  beforeEach(() => {
    clearDashboardGithubCache();
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
    loadDashboardWorkspaceScope.mockImplementation(async () => ({
      workspace: { id: "workspace-1", githubAccountId: 42 },
      installations: await listByAccountLogin(),
      repositories: (await listByInstallation()).map((repository) => ({
        ...repository,
        installationId: "i1",
      })),
    }));
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
      updatedAtIso: "2026-06-20T00:00:00Z",
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
    expect(octokit.paginate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: "closed" }),
    );
    expect(octokit.rest.pulls.list).toHaveBeenCalledWith({
      owner: "KMGeon",
      repo: "Folio",
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 20,
    });
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

  it("globally sorts completed pulls from multiple repos newest first and caps them at 20", async () => {
    listByInstallation.mockResolvedValueOnce([repoRow("r1", "Folio"), repoRow("r2", "Amberjack")]);
    const closedByRepo = Array.from({ length: 25 }, (_, index) => index + 1).reduce<
      Record<string, PullFixture[]>
    >(
      (pulls, day) => {
        const repo = day % 2 === 0 ? "Amberjack" : "Folio";
        pulls[repo]?.push(
          closedPr({
            number: day,
            title: `Completed ${day}`,
            mergedAt: `2026-07-${String(day).padStart(2, "0")}T10:00:00Z`,
          }),
        );
        return pulls;
      },
      { Folio: [], Amberjack: [] },
    );
    const octokit = octokitWith({ open: [], closed: closedByRepo, details: {} });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    const expectedNewestTwenty = Array.from({ length: 20 }, (_, index) => 25 - index);
    expect(payload.completedPulls).toHaveLength(20);
    expect(payload.completedPulls.map((pull) => [pull.repo, pull.number])).toEqual(
      expectedNewestTwenty.map((day) => [day % 2 === 0 ? "Amberjack" : "Folio", day]),
    );
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

  it("keeps reachable completed pulls when one repo open pull fetching fails", async () => {
    listByInstallation.mockResolvedValueOnce([
      repoRow("broken-repo-id", "broken"),
      repoRow("reachable-repo-id", "reachable"),
    ]);
    const octokit = octokitWith({
      open: { broken: [], reachable: [] },
      closed: {
        broken: [closedPr({ number: 11, mergedAt: "2026-07-08T10:00:00Z" })],
        reachable: [closedPr({ number: 12, mergedAt: "2026-07-09T10:00:00Z" })],
      },
      details: { 12: { additions: 12, deletions: 3, changed_files: 4 } },
      failOpenListForRepos: new Set(["broken"]),
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getForUser({ id: "u1", login: "KMGeon" });

    expect(payload.repos).toEqual([
      {
        id: "broken-repo-id",
        fullName: "KMGeon/broken",
        openPrCount: 0,
        folioEnabled: true,
      },
      {
        id: "reachable-repo-id",
        fullName: "KMGeon/reachable",
        openPrCount: 0,
        folioEnabled: true,
      },
    ]);
    expect(payload.pulls).toEqual([]);
    expect(payload.completedPulls).toEqual([
      expect.objectContaining({
        repo: "reachable",
        number: 12,
        completedState: "merged",
        additions: 12,
        deletions: 3,
        changedFiles: 4,
      }),
    ]);
    expect(payload.metrics.completed).toBe(1);
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

  it("returns summary without card arrays", async () => {
    const octokit = octokitWith({
      open: [openPr({ number: 1, title: "Ready PR" })],
      closed: [closedPr({ number: 69, mergedAt: "2026-07-08T10:00:00Z" })],
      details: { 1: { additions: 10, deletions: 2, changed_files: 3 } },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const payload = await facade.getSummaryForUser({ id: "u1", login: "KMGeon" });

    expect(payload).toEqual({
      metrics: {
        ready: 0,
        processing: 0,
        installedRepos: 1,
        activeRepos: 1,
        completed: 0,
      },
      repos: [{ id: "r1", fullName: "KMGeon/Folio", openPrCount: 0, folioEnabled: true }],
      activity: [{ date: "2026-06-20", count: 3 }],
    });
    expect("pulls" in payload).toBe(false);
    expect("completedPulls" in payload).toBe(false);
    expect(octokit.paginate).not.toHaveBeenCalled();
    expect(octokit.rest.pulls.list).not.toHaveBeenCalled();
  });

  it("returns the first ready pull page and next cursor", async () => {
    getByRepoAndNumber.mockImplementation(async (_repoId: string, n: number) =>
      n <= 2 ? { id: `pr${n}` } : null,
    );
    const octokit = octokitWith({
      open: [
        openPr({ number: 1, title: "Ready one" }),
        openPr({ number: 2, title: "Ready two" }),
        openPr({ number: 3, title: "Processing" }),
      ],
      closed: [],
      details: {
        1: { additions: 10, deletions: 2, changed_files: 3 },
        2: { additions: 20, deletions: 4, changed_files: 4 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const page = await facade.getPullPageForUser(
      { id: "u1", login: "someone-else" },
      { bucket: "ready", limit: 1, ordering: "updated", direction: "desc", showDrafts: true },
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ number: 1, title: "Ready one", status: "ready" });
    expect(page.nextCursor).toBeTypeOf("string");
    expect(page.count).toBe(2);
    expect(octokit.rest.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("builds all open buckets while resolving each pull status once", async () => {
    getByRepoAndNumber.mockImplementation(async (_repoId: string, number: number) =>
      number === 3 ? null : { id: `pr${number}` },
    );
    const octokit = octokitWith({
      open: [
        openPr({ number: 1, title: "Ready", user: "reviewer" }),
        openPr({ number: 2, title: "Mine", user: "KMGeon" }),
        openPr({ number: 3, title: "Other", user: "reviewer" }),
      ],
      closed: [],
      details: {},
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const pages = await facade.getOpenPullPagesForUser(
      { id: "u1", login: "KMGeon" },
      { limit: 20, ordering: "updated", direction: "desc", showDrafts: true },
    );

    expect(pages.ready.items.map((pull) => pull.title)).toEqual(["Ready"]);
    expect(pages.yours.items.map((pull) => pull.title)).toEqual(["Mine"]);
    expect(pages.other.items.map((pull) => pull.title)).toEqual(["Other"]);
    expect(getByRepoAndNumber).toHaveBeenCalledTimes(3);
    expect(octokit.paginate).toHaveBeenCalledTimes(1);
  });

  it("continues pull pages from an opaque cursor", async () => {
    getByRepoAndNumber.mockImplementation(async (_repoId: string, n: number) =>
      n <= 2 ? { id: `pr${n}` } : null,
    );
    const octokit = octokitWith({
      open: [openPr({ number: 1, title: "Ready one" }), openPr({ number: 2, title: "Ready two" })],
      closed: [],
      details: {
        1: { additions: 10, deletions: 2, changed_files: 3 },
        2: { additions: 20, deletions: 4, changed_files: 4 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const first = await facade.getPullPageForUser(
      { id: "u1", login: "someone-else" },
      { bucket: "ready", limit: 1, ordering: "updated", direction: "desc", showDrafts: true },
    );
    const second = await facade.getPullPageForUser(
      { id: "u1", login: "someone-else" },
      {
        bucket: "ready",
        limit: 1,
        cursor: first.nextCursor ?? undefined,
        ordering: "updated",
        direction: "desc",
        showDrafts: true,
      },
    );

    expect(second.items.map((pull) => pull.number)).toEqual([2]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters completed pull pages by query and closed range", async () => {
    const octokit = octokitWith({
      open: [],
      closed: [
        closedPr({ number: 69, title: "Keep smoke", mergedAt: "2026-07-08T10:00:00Z" }),
        closedPr({ number: 68, title: "Ignore docs", mergedAt: "2026-05-08T10:00:00Z" }),
      ],
      details: { 69: { additions: 81, deletions: 32, changed_files: 4 } },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const page = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      {
        bucket: "completed",
        limit: 20,
        q: "smoke",
        ordering: "updated",
        direction: "desc",
        closedRange: "90d",
        showDrafts: true,
      },
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ number: 69, title: "Keep smoke" });
    expect(page.count).toBe(1);
    expect(octokit.rest.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("excludes draft pull pages when showDrafts is false", async () => {
    getByRepoAndNumber.mockResolvedValue({ id: "pr" });
    const octokit = octokitWith({
      open: [
        openPr({ number: 1, title: "Visible" }),
        openPr({ number: 2, title: "Draft", draft: true }),
      ],
      closed: [],
      details: { 1: { additions: 10, deletions: 2, changed_files: 3 } },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const page = await facade.getPullPageForUser(
      { id: "u1", login: "someone-else" },
      { bucket: "ready", showDrafts: false },
    );

    expect(page.items.map((pull) => pull.title)).toEqual(["Visible"]);
    expect(octokit.rest.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("sorts open pull pages by line count", async () => {
    getByRepoAndNumber.mockResolvedValue({ id: "pr" });
    const octokit = octokitWith({
      open: [openPr({ number: 1, title: "Small" }), openPr({ number: 2, title: "Large" })],
      closed: [],
      details: {
        1: { additions: 3, deletions: 2, changed_files: 1 },
        2: { additions: 20, deletions: 5, changed_files: 2 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const page = await facade.getPullPageForUser(
      { id: "u1", login: "someone-else" },
      { bucket: "ready", ordering: "lines", direction: "desc" },
    );

    expect(page.items.map((pull) => pull.title)).toEqual(["Large", "Small"]);
  });

  it("separates yours and other pull buckets", async () => {
    getByRepoAndNumber.mockImplementation(async (_repoId: string, n: number) =>
      n === 1 ? { id: "pr1" } : null,
    );
    const octokit = octokitWith({
      open: [
        openPr({ number: 1, title: "Mine", user: "KMGeon" }),
        openPr({ number: 2, title: "Processing", user: "someone-else" }),
      ],
      closed: [],
      details: {
        1: { additions: 10, deletions: 2, changed_files: 3 },
        2: { additions: 4, deletions: 1, changed_files: 1 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const yours = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "yours" },
    );
    const other = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "other" },
    );

    expect(yours.items.map((pull) => pull.title)).toEqual(["Mine"]);
    expect(other.items.map((pull) => pull.title)).toEqual(["Processing"]);
  });

  it("keeps reachable pull page results when one repository fails", async () => {
    listByInstallation.mockResolvedValueOnce([
      repoRow("broken-repo-id", "broken"),
      repoRow("reachable-repo-id", "reachable"),
    ]);
    getByRepoAndNumber.mockResolvedValue({ id: "pr" });
    const octokit = octokitWith({
      open: {
        broken: [openPr({ number: 1, title: "Broken" })],
        reachable: [openPr({ number: 2, title: "Reachable" })],
      },
      closed: [],
      details: { 2: { additions: 10, deletions: 2, changed_files: 3 } },
      failOpenListForRepos: new Set(["broken"]),
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const page = await facade.getPullPageForUser(
      { id: "u1", login: "someone-else" },
      { bucket: "ready" },
    );

    expect(page.items.map((pull) => pull.title)).toEqual(["Reachable"]);
  });

  it("continues completed pull pages beyond the first bounded GitHub window ascending", async () => {
    const closed = Array.from({ length: 25 }, (_, index) =>
      closedPr({
        number: 25 - index,
        closedAt: `2026-07-${String(25 - index).padStart(2, "0")}T10:00:00Z`,
        mergedAt: `2026-07-${String(25 - index).padStart(2, "0")}T10:00:00Z`,
      }),
    );
    const octokit = octokitWith({ open: [], closed, details: {} });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });
    const user = { id: "u1", login: "KMGeon" };
    const query = {
      bucket: "completed",
      limit: 20,
      ordering: "updated",
      direction: "asc",
    } as const;

    const first = await facade.getPullPageForUser(user, query);
    const second = await facade.getPullPageForUser(user, {
      ...query,
      cursor: first.nextCursor ?? undefined,
    });
    expect(first.items.map((pull) => pull.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(second.items.map((pull) => pull.number)).toEqual([21, 22, 23, 24, 25]);
    expect(octokit.rest.pulls.list).toHaveBeenCalledWith(
      expect.objectContaining({ state: "closed", per_page: 20, direction: "asc", page: 2 }),
    );
    expect(octokit.paginate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: "closed" }),
    );
  });

  it("does not duplicate completed pulls after one repo is exhausted while another continues", async () => {
    listByInstallation.mockResolvedValue([
      repoRow("short-repo-id", "short"),
      repoRow("long-repo-id", "long"),
    ]);
    const closedByRepo = {
      short: [closedPr({ number: 100, mergedAt: "2026-07-26T10:00:00Z" })],
      long: Array.from({ length: 25 }, (_, index) =>
        closedPr({
          number: 25 - index,
          mergedAt: `2026-07-${String(25 - index).padStart(2, "0")}T10:00:00Z`,
        }),
      ),
    };
    const octokit = octokitWith({ open: [], closed: closedByRepo, details: {} });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const first = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "completed", limit: 2, ordering: "updated", direction: "desc" },
    );
    const second = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "completed", limit: 2, cursor: first.nextCursor ?? undefined },
    );
    const third = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "completed", limit: 2, cursor: second.nextCursor ?? undefined },
    );

    const seen = [...first.items, ...second.items, ...third.items].map((pull) => pull.id);
    expect(seen).toEqual([
      "KMGeon-short-100",
      "KMGeon-long-25",
      "KMGeon-long-24",
      "KMGeon-long-23",
      "KMGeon-long-22",
      "KMGeon-long-21",
    ]);
  });

  it("continues completed line-ordered pages without duplicates", async () => {
    const octokit = octokitWith({
      open: [],
      closed: [
        closedPr({ number: 1, title: "Small", mergedAt: "2026-07-03T10:00:00Z" }),
        closedPr({ number: 2, title: "Large", mergedAt: "2026-07-02T10:00:00Z" }),
        closedPr({ number: 3, title: "Medium", mergedAt: "2026-07-01T10:00:00Z" }),
      ],
      details: {
        1: { additions: 1, deletions: 0, changed_files: 1 },
        2: { additions: 30, deletions: 0, changed_files: 1 },
        3: { additions: 20, deletions: 0, changed_files: 1 },
      },
    });
    const facade = new DashboardFacade({ octokitFactory: async () => octokit as never });

    const first = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "completed", limit: 1, ordering: "lines", direction: "desc" },
    );
    const second = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      {
        bucket: "completed",
        limit: 1,
        cursor: first.nextCursor ?? undefined,
        ordering: "lines",
        direction: "desc",
      },
    );

    expect(first.items.map((pull) => pull.number)).toEqual([2]);
    expect(second.items.map((pull) => pull.number)).toEqual([3]);
  });
});
