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
const getByRepoAndNumber = vi.fn(async () => ({ id: "pr" }));

vi.mock("@folio/db", () => ({
  installationsRepo: { listByAccountLogin },
  repositoriesRepo: { listByInstallation },
  pullRequestsRepo: { getByRepoAndNumber },
  revisionsRepo: { latestForPr: vi.fn(async () => ({ id: "revision" })) },
  chaptersRepo: { listByRevision: vi.fn(async () => [{ hunkRefs: [] }]) },
  reviewStateRepo: { progressForRevision: vi.fn(async () => ({ viewed: 0 })) },
}));
vi.mock("@folio/github", () => ({ createInstallationOctokit: vi.fn() }));
vi.mock("../../infrastructure/github/github-contributions.js", () => ({
  fetchPublicContributions: vi.fn(async () => []),
}));

const { DashboardFacade } = await import("./dashboard.facade.js");
const { clearDashboardGithubCache } = await import("./dashboard-github-cache.js");

type OpenPull = {
  number: number;
  title: string;
  user: { login: string };
  head: { ref: string };
  base: { ref: string };
  updated_at: string;
  draft: boolean;
};

type PullDetails = Record<number, { additions: number; deletions: number; changed_files: number }>;

function openPull(number: number, title: string, updatedAt = "2026-07-09T00:00:00Z"): OpenPull {
  return {
    number,
    title,
    user: { login: "reviewer" },
    head: { ref: "feature" },
    base: { ref: "main" },
    updated_at: updatedAt,
    draft: false,
  };
}

function octokitWith(open: OpenPull[], details: PullDetails) {
  const list = vi.fn();
  return {
    paginate: vi.fn(async () => open),
    rest: {
      pulls: {
        list,
        get: vi.fn(async ({ pull_number }: { pull_number: number }) => ({
          data: details[pull_number] ?? { additions: 0, deletions: 0, changed_files: 0 },
        })),
      },
    },
  };
}

describe("DashboardFacade combined open pull pages", () => {
  beforeEach(() => {
    clearDashboardGithubCache();
    vi.clearAllMocks();
  });

  it("orders every combined open bucket by line count", async () => {
    const octokit = octokitWith([openPull(1, "Small"), openPull(2, "Large")], {
      1: { additions: 3, deletions: 2, changed_files: 1 },
      2: { additions: 20, deletions: 5, changed_files: 2 },
    });
    const facade = new DashboardFacade({
      octokitFactory: async () => octokit as never,
      workspaceScopeLoader: async () => workspaceScope(await listByInstallation()),
    });

    const pages = await facade.getOpenPullPagesForUser(
      { id: "u1", login: "KMGeon" },
      { limit: 1, ordering: "lines", direction: "desc", showDrafts: true },
    );

    expect(pages.ready.items.map((pull) => pull.title)).toEqual(["Large"]);
    expect(pages.ready.count).toBe(2);
    expect(pages.ready.nextCursor).toBeTypeOf("string");
    expect(pages.yours.items).toEqual([]);
    expect(pages.other.items).toEqual([]);
  });

  it("continues a combined page through the matching legacy bucket endpoint", async () => {
    const octokit = octokitWith(
      [openPull(1, "Newest ready"), openPull(2, "Older ready", "2026-07-08T00:00:00Z")],
      { 1: { additions: 1, deletions: 1, changed_files: 1 } },
    );
    const facade = new DashboardFacade({
      octokitFactory: async () => octokit as never,
      workspaceScopeLoader: async () => workspaceScope(await listByInstallation()),
    });
    const query = { limit: 1, ordering: "updated", direction: "desc", showDrafts: true } as const;

    const combined = await facade.getOpenPullPagesForUser({ id: "u1", login: "KMGeon" }, query);
    const legacy = await facade.getPullPageForUser(
      { id: "u1", login: "KMGeon" },
      { bucket: "ready", cursor: combined.ready.nextCursor ?? undefined, ...query },
    );

    expect(combined.ready.items.map((pull) => pull.title)).toEqual(["Newest ready"]);
    expect(combined.ready.items[0]).toMatchObject({
      updatedAtIso: "2026-07-09T00:00:00Z",
    });
    expect(legacy.items.map((pull) => pull.title)).toEqual(["Older ready"]);
    expect(legacy.items[0]).toMatchObject({
      updatedAtIso: "2026-07-08T00:00:00Z",
    });
    expect(legacy.nextCursor).toBeNull();
  });
});

function workspaceScope(repositories: Awaited<ReturnType<typeof listByInstallation>>) {
  return {
    workspace: { id: "workspace-1", githubAccountId: 42 },
    installations: [{ id: "i1", githubInstallationId: 111 }],
    repositories: repositories.map((repository) => ({ installationId: "i1", ...repository })),
  } as never;
}
