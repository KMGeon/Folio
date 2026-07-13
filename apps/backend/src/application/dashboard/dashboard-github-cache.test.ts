import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getByRepoAndNumber,
  latestForPr,
  listByAccountLogin,
  listByInstallation,
  listByRevision,
  progressForRevision,
} = vi.hoisted(() => ({
  getByRepoAndNumber: vi.fn(),
  latestForPr: vi.fn(),
  listByAccountLogin: vi.fn(async () => [{ id: "i1", githubInstallationId: 111 }]),
  listByInstallation: vi.fn(async () => [
    {
      id: "r1",
      owner: "KMGeon",
      name: "Folio",
      fullName: "KMGeon/Folio",
      defaultBranch: "main",
      folioEnabled: true,
    },
  ]),
  listByRevision: vi.fn(),
  progressForRevision: vi.fn(),
}));

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
  fetchPublicContributions: vi.fn(async () => []),
}));

const { DashboardFacade } = await import("./dashboard.facade.js");
const { clearDashboardGithubCache } = await import("./dashboard-github-cache.js");

describe("dashboard GitHub cache", () => {
  beforeEach(() => {
    clearDashboardGithubCache();
    vi.clearAllMocks();
  });

  it("reuses completed pull list and detail results for repeated dashboard pages", async () => {
    const octokit = octokitWithCompletedPull();
    const facade = new DashboardFacade({
      octokitFactory: async () => octokit as never,
      workspaceScopeLoader: async () => ({
        workspaces: [{ id: "workspace-1", githubAccountId: 42 } as never],
        installations: [{ id: "i1", githubInstallationId: 111 } as never],
        repositories: (await listByInstallation()).map((repository) => ({
          installationId: "i1",
          ...repository,
        })) as never,
      }),
    });
    const query = {
      bucket: "completed" as const,
      limit: 20,
      ordering: "updated" as const,
      direction: "desc" as const,
      closedRange: "1d" as const,
      showDrafts: true,
    };

    await facade.getPullPageForUser({ id: "u1", login: "KMGeon" }, query);
    await facade.getPullPageForUser({ id: "u1", login: "KMGeon" }, query);

    expect(octokit.rest.pulls.list).toHaveBeenCalledTimes(1);
    expect(octokit.rest.pulls.get).toHaveBeenCalledTimes(1);
  });
});

function octokitWithCompletedPull() {
  const pulls = {
    list: vi.fn(async () => ({
      data: [
        {
          number: 70,
          title: "Recent merge",
          user: { login: "octo" },
          head: { ref: "feature" },
          base: { ref: "main" },
          updated_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
          merged_at: new Date().toISOString(),
        },
      ],
    })),
    get: vi.fn(async () => ({ data: { additions: 8, deletions: 3, changed_files: 1 } })),
  };
  return {
    paginate: vi.fn(async () => []),
    rest: { pulls },
  };
}
