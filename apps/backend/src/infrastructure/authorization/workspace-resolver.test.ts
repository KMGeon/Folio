import {
  type InstallationRow,
  type RepositoryRow,
  type WorkspaceRow,
  installationsRepo,
  repositoriesRepo,
  workspacesRepo,
} from "@folio/db";
import { ACCOUNT_TYPE } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceResolver } from "./workspace-resolver.js";

vi.mock("@folio/db", () => ({
  installationsRepo: { listByWorkspaceAccountId: vi.fn() },
  repositoriesRepo: { getByGithubId: vi.fn() },
  workspacesRepo: {
    getByGithubAccountId: vi.fn(),
    getById: vi.fn(),
  },
}));

const now = new Date("2026-07-10T00:00:00.000Z");

function workspaceRow(overrides: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    id: "workspace-1",
    githubAccountId: 42,
    accountLogin: "acme",
    accountType: ACCOUNT_TYPE.ORGANIZATION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function repositoryRow(overrides: Partial<RepositoryRow> = {}): RepositoryRow {
  return {
    id: "repository-1",
    installationId: "installation-1",
    workspaceId: "workspace-1",
    githubRepoId: 99,
    owner: "acme",
    name: "folio",
    fullName: "acme/folio",
    private: true,
    defaultBranch: "main",
    folioEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function installationRow(overrides: Partial<InstallationRow> = {}): InstallationRow {
  return {
    id: "installation-1",
    githubInstallationId: 7,
    githubAccountId: 42,
    accountLogin: "acme",
    accountType: ACCOUNT_TYPE.ORGANIZATION,
    suspendedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const resolver = new WorkspaceResolver();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceResolver", () => {
  it("resolves a workspace by stable GitHub account id", async () => {
    const workspace = workspaceRow();
    vi.mocked(workspacesRepo.getByGithubAccountId).mockResolvedValue(workspace);

    await expect(resolver.resolveByGithubAccountId(42)).resolves.toBe(workspace);

    expect(workspacesRepo.getByGithubAccountId).toHaveBeenCalledWith(42);
  });

  it("resolves a workspace by internal id", async () => {
    const workspace = workspaceRow();
    vi.mocked(workspacesRepo.getById).mockResolvedValue(workspace);

    await expect(resolver.resolveById("workspace-1")).resolves.toBe(workspace);

    expect(workspacesRepo.getById).toHaveBeenCalledWith("workspace-1");
  });

  it("resolves a repository's workspace through its stable numeric id", async () => {
    const workspace = workspaceRow();
    vi.mocked(repositoriesRepo.getByGithubId).mockResolvedValue(repositoryRow());
    vi.mocked(workspacesRepo.getById).mockResolvedValue(workspace);

    await expect(resolver.resolveForRepoId(99)).resolves.toBe(workspace);

    expect(repositoriesRepo.getByGithubId).toHaveBeenCalledWith(99);
    expect(workspacesRepo.getById).toHaveBeenCalledWith("workspace-1");
  });

  it.each([
    ["missing", null],
    ["not linked", repositoryRow({ workspaceId: null })],
  ])("returns null when the repository is %s", async (_label, repository) => {
    vi.mocked(repositoriesRepo.getByGithubId).mockResolvedValue(repository);

    await expect(resolver.resolveForRepoId(99)).resolves.toBeNull();

    expect(workspacesRepo.getById).not.toHaveBeenCalled();
  });

  it("lists installations by the workspace's stable GitHub account id", async () => {
    const installations = [installationRow()];
    vi.mocked(installationsRepo.listByWorkspaceAccountId).mockResolvedValue(installations);

    await expect(resolver.listInstallationsForWorkspace(42)).resolves.toBe(installations);

    expect(installationsRepo.listByWorkspaceAccountId).toHaveBeenCalledWith(42);
  });
});
