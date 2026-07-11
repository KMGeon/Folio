import {
  auditLogsRepo,
  repositoriesRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { getUserRepoPermissionLevel } from "@folio/github";
import type { GitHubRepoAccessLevel } from "@folio/github";
import {
  ACCOUNT_TYPE,
  AUDIT_ACTION,
  GLOBAL_STATUS,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
} from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { RepositoriesFacade } from "./repositories.facade.js";

const transaction = { transaction: vi.fn() };

vi.mock("@folio/db", () => ({
  auditLogsRepo: { record: vi.fn() },
  getDb: vi.fn(() => transaction),
  installationsRepo: { listByAccountLogin: vi.fn(async () => []) },
  repositoriesRepo: {
    getById: vi.fn(),
    getByIdForUpdate: vi.fn(),
    listByInstallationIds: vi.fn(async () => []),
    listByWorkspaceId: vi.fn(),
    setFolioEnabled: vi.fn(),
  },
  usersRepo: { getById: vi.fn(), getByIdForUpdate: vi.fn() },
  workspaceMembersRepo: { getMembership: vi.fn(), getMembershipsForUpdate: vi.fn() },
  workspacesRepo: { getByIdForUpdate: vi.fn() },
}));

const now = new Date("2026-07-11T00:00:00.000Z");
const workspace = {
  id: "workspace-1",
  githubAccountId: 42,
  accountLogin: "acme",
  accountType: ACCOUNT_TYPE.ORGANIZATION,
  createdAt: now,
  updatedAt: now,
};
const repository = {
  id: "repo-1",
  installationId: "installation-1",
  workspaceId: workspace.id,
  githubRepoId: 456,
  owner: "acme",
  name: "folio",
  fullName: "acme/folio",
  private: true,
  defaultBranch: "main",
  folioEnabled: false,
  createdAt: now,
  updatedAt: now,
};
const user = {
  id: "user-1",
  githubUserId: 7,
  login: "octocat",
  avatarUrl: "https://avatars/octocat",
  email: null,
  status: "approved" as const,
  globalStatus: GLOBAL_STATUS.ACTIVE,
  isSystemAdmin: false,
  createdAt: now,
  updatedAt: now,
};
const membership = {
  id: "membership-1",
  workspaceId: workspace.id,
  userId: user.id,
  role: WORKSPACE_ROLE.ADMIN,
  status: MEMBERSHIP_STATUS.ACTIVE,
  elevatedBy: null,
  suspendedBy: null,
  joinedAt: now,
  createdAt: now,
  updatedAt: now,
};

const ACCESS_RANK: Record<GitHubRepoAccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

function liveRepoAccess(permission: string) {
  return {
    assertLiveLevelAtLeast: vi.fn(
      async (
        input: { owner: string; repo: string; username: string },
        required: GitHubRepoAccessLevel,
      ) => {
        const client = {
          rest: {
            repos: {
              getCollaboratorPermissionLevel: vi.fn().mockResolvedValue({ data: { permission } }),
            },
          },
        } as unknown as Parameters<typeof getUserRepoPermissionLevel>[0];
        const actual = await getUserRepoPermissionLevel(client, input);
        return ACCESS_RANK[actual] >= ACCESS_RANK[required];
      },
    ),
  };
}

describe("RepositoriesFacade", () => {
  const resolver = { firstWorkspaceForUser: vi.fn() };
  const repoAccess = { assertLiveLevelAtLeast: vi.fn() };
  let facade: RepositoriesFacade;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver.firstWorkspaceForUser.mockResolvedValue(workspace);
    repoAccess.assertLiveLevelAtLeast.mockResolvedValue(true);
    vi.mocked(usersRepo.getById).mockResolvedValue(user);
    vi.mocked(usersRepo.getByIdForUpdate).mockResolvedValue(user);
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(membership);
    vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([membership]);
    vi.mocked(workspacesRepo.getByIdForUpdate).mockResolvedValue(workspace);
    vi.mocked(repositoriesRepo.getById).mockResolvedValue(repository);
    vi.mocked(repositoriesRepo.getByIdForUpdate).mockResolvedValue(repository);
    vi.mocked(repositoriesRepo.listByWorkspaceId).mockResolvedValue([repository]);
    vi.mocked(repositoriesRepo.setFolioEnabled).mockResolvedValue({
      ...repository,
      folioEnabled: true,
    });
    vi.mocked(auditLogsRepo.record).mockResolvedValue({
      id: "audit-1",
      actorUserId: user.id,
      action: AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
      targetType: "repository",
      targetId: repository.id,
      workspaceId: workspace.id,
      before: { folioEnabled: false },
      after: { folioEnabled: true },
      createdAt: now,
      updatedAt: now,
    });
    transaction.transaction.mockImplementation(async (operation) => operation("tx"));
    facade = new RepositoriesFacade(resolver as never, repoAccess as never);
  });

  it("lists repositories only from the actor's stable workspace", async () => {
    const result = await facade.listForUser({ userId: user.id, login: user.login });

    expect(resolver.firstWorkspaceForUser).toHaveBeenCalledWith(user.id);
    expect(repositoriesRepo.listByWorkspaceId).toHaveBeenCalledWith(workspace.id);
    expect(result.repositories).toEqual([
      expect.objectContaining({ id: repository.id, fullName: repository.fullName }),
    ]);
  });

  it("returns an empty list when the actor has no workspace", async () => {
    resolver.firstWorkspaceForUser.mockResolvedValue(null);

    await expect(facade.listForUser({ userId: user.id, login: user.login })).resolves.toEqual({
      repositories: [],
    });
    expect(repositoriesRepo.listByWorkspaceId).not.toHaveBeenCalled();
  });

  it("denies repository listing to a suspended workspace member", async () => {
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue({
      ...membership,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    });

    await expectCoreException(facade.listForUser({ userId: user.id, login: user.login }), 403);
    expect(repositoriesRepo.listByWorkspaceId).not.toHaveBeenCalled();
  });

  it("rejects a repository from another workspace", async () => {
    vi.mocked(repositoriesRepo.getByIdForUpdate).mockResolvedValue({
      ...repository,
      workspaceId: "workspace-2",
    });

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      404,
    );
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
  });

  it.each([
    ["reviewer", { role: WORKSPACE_ROLE.REVIEWER }],
    ["suspended admin", { status: MEMBERSHIP_STATUS.SUSPENDED }],
  ])("denies activation by a %s", async (_label, overrides) => {
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue({
      ...membership,
      ...overrides,
    });

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      403,
    );
    expect(repoAccess.assertLiveLevelAtLeast).not.toHaveBeenCalled();
  });

  it("denies activation below live GitHub admin permission", async () => {
    repoAccess.assertLiveLevelAtLeast.mockResolvedValue(false);

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      403,
    );
    expect(repoAccess.assertLiveLevelAtLeast).toHaveBeenCalledWith(
      { owner: repository.owner, repo: repository.name, username: user.login },
      "admin",
    );
    expect(transaction.transaction).not.toHaveBeenCalled();
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
  });

  it("locks membership, user, and repository in order after live GitHub authorization", async () => {
    const order: string[] = [];
    repoAccess.assertLiveLevelAtLeast.mockImplementation(async () => {
      order.push("github authorization");
      expect(transaction.transaction).not.toHaveBeenCalled();
      expect(workspaceMembersRepo.getMembershipsForUpdate).not.toHaveBeenCalled();
      expect(usersRepo.getByIdForUpdate).not.toHaveBeenCalled();
      expect(repositoriesRepo.getByIdForUpdate).not.toHaveBeenCalled();
      return true;
    });
    transaction.transaction.mockImplementation(async (operation) => {
      order.push("transaction");
      return operation("tx");
    });
    vi.mocked(workspacesRepo.getByIdForUpdate).mockImplementation(async () => {
      order.push("workspace lock");
      return workspace;
    });
    vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockImplementation(async () => {
      order.push("membership lock");
      return [membership];
    });
    vi.mocked(usersRepo.getByIdForUpdate).mockImplementation(async () => {
      order.push("user lock");
      return user;
    });
    vi.mocked(repositoriesRepo.getByIdForUpdate).mockImplementation(async () => {
      order.push("repository lock");
      return repository;
    });

    await facade.setEnabled({
      user: { id: user.id, login: user.login },
      repositoryId: repository.id,
      enabled: true,
    });

    expect(order).toEqual([
      "github authorization",
      "transaction",
      "workspace lock",
      "membership lock",
      "user lock",
      "repository lock",
    ]);
  });

  it("revalidates repository workspace after GitHub authorization", async () => {
    vi.mocked(repositoriesRepo.getByIdForUpdate).mockResolvedValue({
      ...repository,
      workspaceId: "workspace-2",
    });

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      404,
    );

    expect(repoAccess.assertLiveLevelAtLeast).toHaveBeenCalledOnce();
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("rejects a repository identity change after GitHub authorization", async () => {
    vi.mocked(repositoriesRepo.getByIdForUpdate).mockResolvedValue({
      ...repository,
      owner: "new-owner",
      fullName: "new-owner/folio",
    });

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      404,
    );

    expect(repoAccess.assertLiveLevelAtLeast).toHaveBeenCalledWith(
      { owner: repository.owner, repo: repository.name, username: user.login },
      "admin",
    );
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("revalidates the actor's active global status after GitHub authorization", async () => {
    vi.mocked(usersRepo.getByIdForUpdate).mockResolvedValue({
      ...user,
      globalStatus: GLOBAL_STATUS.SUSPENDED,
    });

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      403,
    );

    expect(repoAccess.assertLiveLevelAtLeast).toHaveBeenCalledOnce();
    expect(usersRepo.getByIdForUpdate).toHaveBeenCalledWith(user.id, "tx");
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("revalidates the actor's active workspace admin status after GitHub authorization", async () => {
    vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([
      { ...membership, status: MEMBERSHIP_STATUS.SUSPENDED },
    ]);

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      403,
    );

    expect(repoAccess.assertLiveLevelAtLeast).toHaveBeenCalledOnce();
    expect(workspaceMembersRepo.getMembershipsForUpdate).toHaveBeenCalledWith(
      workspace.id,
      [user.id],
      "tx",
    );
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("rejects GitHub maintain permission for repository activation", async () => {
    const maintainAccess = liveRepoAccess("maintain");
    facade = new RepositoriesFacade(resolver as never, maintainAccess as never);

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      403,
    );
    expect(maintainAccess.assertLiveLevelAtLeast).toHaveBeenCalledWith(
      { owner: repository.owner, repo: repository.name, username: user.login },
      "admin",
    );
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
  });

  it("accepts GitHub admin permission for repository activation", async () => {
    const adminAccess = liveRepoAccess("admin");
    facade = new RepositoriesFacade(resolver as never, adminAccess as never);

    await expect(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
    ).resolves.toMatchObject({ id: repository.id, folioEnabled: true });
    expect(adminAccess.assertLiveLevelAtLeast).toHaveBeenCalledWith(
      { owner: repository.owner, repo: repository.name, username: user.login },
      "admin",
    );
  });

  it("updates activation and records one audit in the same transaction", async () => {
    const result = await facade.setEnabled({
      user: { id: user.id, login: user.login },
      repositoryId: repository.id,
      enabled: true,
    });

    expect(repositoriesRepo.getByIdForUpdate).toHaveBeenCalledWith(repository.id, "tx");
    expect(repositoriesRepo.setFolioEnabled).toHaveBeenCalledWith(repository.id, true, "tx");
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      {
        actorUserId: user.id,
        action: AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
        targetType: "repository",
        targetId: repository.id,
        workspaceId: workspace.id,
        before: { folioEnabled: false },
        after: { folioEnabled: true },
      },
      "tx",
    );
    expect(result.folioEnabled).toBe(true);
  });

  it("returns the locked row without an update or duplicate audit when unchanged", async () => {
    vi.mocked(repositoriesRepo.getByIdForUpdate).mockResolvedValue({
      ...repository,
      folioEnabled: true,
    });

    const result = await facade.setEnabled({
      user: { id: user.id, login: user.login },
      repositoryId: repository.id,
      enabled: true,
    });

    expect(result.folioEnabled).toBe(true);
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("rolls the activation update back when audit persistence fails", async () => {
    const rollback = new Error("audit unavailable");
    vi.mocked(auditLogsRepo.record).mockRejectedValue(rollback);

    await expect(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
    ).rejects.toBe(rollback);
    expect(repositoriesRepo.setFolioEnabled).toHaveBeenCalledWith(repository.id, true, "tx");
    expect(auditLogsRepo.record).toHaveBeenCalledWith(expect.any(Object), "tx");
  });
});

async function expectCoreException(action: Promise<unknown>, statusCode: number): Promise<void> {
  let caught: unknown;
  try {
    await action;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CoreException);
  expect(caught).toMatchObject({ errorType: { statusCode } });
}
