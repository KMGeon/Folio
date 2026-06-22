import { installationsRepo, repositoriesRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesFacade } from "./repositories.facade.js";

vi.mock("@folio/db", () => ({
  installationsRepo: {
    listByAccountLogin: vi.fn(),
  },
  repositoriesRepo: {
    listByInstallationIds: vi.fn(),
    setFolioEnabled: vi.fn(),
  },
}));

describe("RepositoriesFacade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists repositories for the current user's installations", async () => {
    vi.mocked(installationsRepo.listByAccountLogin).mockResolvedValue([
      {
        id: "installation-1",
        githubInstallationId: 123,
        accountLogin: "KMGeon",
        accountType: "User",
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(repositoriesRepo.listByInstallationIds).mockResolvedValue([
      {
        id: "repo-1",
        installationId: "installation-1",
        githubRepoId: 456,
        owner: "KMGeon",
        name: "Folio",
        fullName: "KMGeon/Folio",
        private: true,
        defaultBranch: "main",
        folioEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await new RepositoriesFacade().listForUser({ login: "KMGeon" });

    expect(repositoriesRepo.listByInstallationIds).toHaveBeenCalledWith(["installation-1"]);
    expect(result.repositories).toEqual([
      {
        id: "repo-1",
        installationId: "installation-1",
        githubRepoId: 456,
        owner: "KMGeon",
        name: "Folio",
        fullName: "KMGeon/Folio",
        private: true,
        defaultBranch: "main",
        folioEnabled: false,
      },
    ]);
  });

  it("rejects toggles outside the current user's installations", async () => {
    vi.mocked(installationsRepo.listByAccountLogin).mockResolvedValue([
      {
        id: "installation-1",
        githubInstallationId: 123,
        accountLogin: "KMGeon",
        accountType: "User",
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(repositoriesRepo.listByInstallationIds).mockResolvedValue([]);

    await expect(
      new RepositoriesFacade().setEnabled({
        user: { login: "KMGeon" },
        repositoryId: "repo-outside-scope",
        enabled: true,
      }),
    ).rejects.toThrow("Repository not found");
  });

  it("toggles repositories in the current user's installations", async () => {
    vi.mocked(installationsRepo.listByAccountLogin).mockResolvedValue([
      {
        id: "installation-1",
        githubInstallationId: 123,
        accountLogin: "KMGeon",
        accountType: "User",
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(repositoriesRepo.listByInstallationIds).mockResolvedValue([
      {
        id: "repo-1",
        installationId: "installation-1",
        githubRepoId: 456,
        owner: "KMGeon",
        name: "Folio",
        fullName: "KMGeon/Folio",
        private: true,
        defaultBranch: "main",
        folioEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(repositoriesRepo.setFolioEnabled).mockResolvedValue({
      id: "repo-1",
      installationId: "installation-1",
      githubRepoId: 456,
      owner: "KMGeon",
      name: "Folio",
      fullName: "KMGeon/Folio",
      private: true,
      defaultBranch: "main",
      folioEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await new RepositoriesFacade().setEnabled({
      user: { login: "KMGeon" },
      repositoryId: "repo-1",
      enabled: true,
    });

    expect(repositoriesRepo.setFolioEnabled).toHaveBeenCalledWith("repo-1", true);
    expect(result).toEqual({
      id: "repo-1",
      installationId: "installation-1",
      githubRepoId: 456,
      owner: "KMGeon",
      name: "Folio",
      fullName: "KMGeon/Folio",
      private: true,
      defaultBranch: "main",
      folioEnabled: true,
    });
  });
});
