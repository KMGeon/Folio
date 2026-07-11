import {
  installationsRepo,
  repositoriesRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FolioDbModule = Record<string, unknown> & {
  installationsRepo: typeof installationsRepo;
  repositoriesRepo: typeof repositoriesRepo;
  workspaceMembersRepo: typeof workspaceMembersRepo;
  workspacesRepo: typeof workspacesRepo;
};

vi.mock("@folio/db", async (importOriginal) => {
  const actual = (await importOriginal()) as FolioDbModule;
  return {
    ...actual,
    installationsRepo: {
      ...actual.installationsRepo,
      listByWorkspaceAccountId: vi.fn(),
      listByAccountLogin: vi.fn(),
    },
    repositoriesRepo: { ...actual.repositoriesRepo, listByWorkspaceId: vi.fn() },
    workspaceMembersRepo: { ...actual.workspaceMembersRepo, listByUser: vi.fn() },
    workspacesRepo: { ...actual.workspacesRepo, getById: vi.fn() },
  };
});
vi.mock("../../infrastructure/github/github-contributions.js", () => ({
  fetchPublicContributions: vi.fn(async () => []),
}));

const { DashboardFacade } = await import("./dashboard.facade.js");
const { loadDashboardWorkspaceScope } = await import("./dashboard-workspace-scope.js");

describe("dashboard workspace scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workspaceMembersRepo.listByUser).mockResolvedValue([
      { workspaceId: "workspace-1", status: "active" } as never,
    ]);
    vi.mocked(workspacesRepo.getById).mockResolvedValue({
      id: "workspace-1",
      githubAccountId: 42,
    } as never);
    vi.mocked(installationsRepo.listByWorkspaceAccountId).mockResolvedValue([
      { id: "installation-1", githubInstallationId: 111 } as never,
    ]);
    vi.mocked(repositoriesRepo.listByWorkspaceId).mockResolvedValue([
      {
        id: "repository-1",
        installationId: "installation-1",
        fullName: "acme/folio",
        folioEnabled: false,
      } as never,
    ]);
  });

  it("never enumerates a same-login installation from another workspace", async () => {
    const scope = await loadDashboardWorkspaceScope("user-1");

    expect(workspaceMembersRepo.listByUser).toHaveBeenCalledWith("user-1");
    expect(installationsRepo.listByWorkspaceAccountId).toHaveBeenCalledWith(42);
    expect(repositoriesRepo.listByWorkspaceId).toHaveBeenCalledWith("workspace-1");
    expect(installationsRepo.listByAccountLogin).not.toHaveBeenCalled();
    expect(scope?.installations.map((installation) => installation.id)).toEqual(["installation-1"]);
  });

  it("returns an empty dashboard when the actor has no active workspace", async () => {
    vi.mocked(workspaceMembersRepo.listByUser).mockResolvedValue([]);
    const facade = new DashboardFacade({ octokitFactory: vi.fn() });

    const payload = await facade.getForUser({ id: "user-1", login: "same-login" });

    expect(payload).toMatchObject({
      metrics: { ready: 0, processing: 0, installedRepos: 0, activeRepos: 0, completed: 0 },
      repos: [],
      pulls: [],
      completedPulls: [],
    });
    expect(installationsRepo.listByAccountLogin).not.toHaveBeenCalled();
  });
});
