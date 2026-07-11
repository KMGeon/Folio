import {
  installationsRepo,
  repositoriesRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import type { DashboardResolvedRepositoryBatchAuthorizer } from "./dashboard-workspace-scope.js";

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
const originalEnv = { ...process.env };

describe("dashboard workspace scope", () => {
  const filterReadableResolvedRepositories = vi.fn<DashboardResolvedRepositoryBatchAuthorizer>(
    async (input) => [...input.repositories],
  );

  beforeEach(() => {
    vi.clearAllMocks();
    filterReadableResolvedRepositories.mockImplementation(async (input) => [...input.repositories]);
    vi.mocked(workspaceMembersRepo.listByUser).mockResolvedValue([
      {
        workspaceId: "workspace-1",
        status: MEMBERSHIP_STATUS.ACTIVE,
        role: WORKSPACE_ROLE.REVIEWER,
      } as never,
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
        owner: "acme",
        name: "folio",
        fullName: "acme/folio",
        folioEnabled: false,
      } as never,
    ]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns no scope when the actor has no workspace membership", async () => {
    vi.mocked(workspaceMembersRepo.listByUser).mockResolvedValue([]);

    await expect(
      loadDashboardWorkspaceScope("user-1", "octocat", filterReadableResolvedRepositories),
    ).resolves.toBeNull();

    expect(workspacesRepo.getById).not.toHaveBeenCalled();
    expect(filterReadableResolvedRepositories).not.toHaveBeenCalled();
  });

  it("denies a suspended workspace membership", async () => {
    vi.mocked(workspaceMembersRepo.listByUser).mockResolvedValue([
      {
        workspaceId: "workspace-1",
        status: MEMBERSHIP_STATUS.SUSPENDED,
        role: WORKSPACE_ROLE.REVIEWER,
      } as never,
    ]);

    await expect(
      loadDashboardWorkspaceScope("user-1", "octocat", filterReadableResolvedRepositories),
    ).rejects.toMatchObject({ errorType: { statusCode: 403 } });
  });

  it("denies a membership below reviewer role", async () => {
    vi.mocked(workspaceMembersRepo.listByUser).mockResolvedValue([
      {
        workspaceId: "workspace-1",
        status: MEMBERSHIP_STATUS.ACTIVE,
        role: "guest",
      } as never,
    ]);

    await expect(
      loadDashboardWorkspaceScope("user-1", "octocat", filterReadableResolvedRepositories),
    ).rejects.toBeInstanceOf(CoreException);
  });

  it("allows an active reviewer and checks every repository with live GitHub read access", async () => {
    const scope = await loadDashboardWorkspaceScope(
      "user-1",
      "octocat",
      filterReadableResolvedRepositories,
    );

    expect(workspaceMembersRepo.listByUser).toHaveBeenCalledWith("user-1");
    expect(installationsRepo.listByWorkspaceAccountId).toHaveBeenCalledWith(42);
    expect(repositoriesRepo.listByWorkspaceId).toHaveBeenCalledWith("workspace-1");
    expect(installationsRepo.listByAccountLogin).not.toHaveBeenCalled();
    expect(filterReadableResolvedRepositories).toHaveBeenCalledWith({
      installations: [{ id: "installation-1", githubInstallationId: 111 }],
      repositories: [expect.objectContaining({ id: "repository-1", name: "folio" })],
      username: "octocat",
    });
    expect(scope?.installations.map((installation) => installation.id)).toEqual(["installation-1"]);
  });

  it("filters repository metadata when live GitHub read permission is denied", async () => {
    filterReadableResolvedRepositories.mockResolvedValue([]);

    const scope = await loadDashboardWorkspaceScope(
      "user-1",
      "octocat",
      filterReadableResolvedRepositories,
    );

    expect(scope?.repositories).toEqual([]);
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

  it.each(["dashboard", "summary", "pulls", "open pulls"])(
    "does not expose repositories denied by the dev permission adapter on %s",
    async (readPath) => {
      process.env.APP_PROFILE = "dev";
      process.env.NODE_ENV = "development";
      vi.mocked(repositoriesRepo.listByWorkspaceId).mockResolvedValue([
        {
          id: "repository-1",
          installationId: "installation-1",
          owner: "acme",
          name: "folio",
          fullName: "acme/folio",
          folioEnabled: true,
        } as never,
      ]);
      const getResolvedRepositoryPermissionLevels = vi.fn().mockResolvedValue(["none"]);
      const { RepoAccessService } = await import("../../domain/auth/repo-access.service.js");
      const repoAccess = new RepoAccessService({
        getResolvedRepositoryPermissionLevels,
        getUserRepoPermissionLevel: vi.fn(),
      } as never);
      const octokitFactory = vi.fn();
      const facade = new DashboardFacade({
        octokitFactory,
        repoAccess,
      });

      const user = { id: "user-1", login: "octocat" };
      const payload =
        readPath === "dashboard"
          ? await facade.getForUser(user)
          : readPath === "summary"
            ? await facade.getSummaryForUser(user)
            : readPath === "pulls"
              ? await facade.getPullPageForUser(user, { bucket: "ready" })
              : await facade.getOpenPullPagesForUser(user, {});

      expect(getResolvedRepositoryPermissionLevels).toHaveBeenCalledWith({
        installations: [{ id: "installation-1", githubInstallationId: 111 }],
        repositories: [
          {
            installationId: "installation-1",
            owner: "acme",
            repo: "folio",
          },
        ],
        username: "octocat",
      });
      expect(octokitFactory).not.toHaveBeenCalled();
      expect(JSON.stringify(payload)).not.toContain("repository-1");
    },
  );
});
