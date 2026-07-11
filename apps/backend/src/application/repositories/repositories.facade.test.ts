import { auditLogsRepo, repositoriesRepo, usersRepo, workspaceMembersRepo } from "@folio/db";
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
    getByIdForUpdate: vi.fn(),
    listByInstallationIds: vi.fn(async () => []),
    listByWorkspaceId: vi.fn(),
    setFolioEnabled: vi.fn(),
  },
  usersRepo: { getById: vi.fn() },
  workspaceMembersRepo: { getMembership: vi.fn() },
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

describe("RepositoriesFacade", () => {
  const resolver = { firstWorkspaceForUser: vi.fn() };
  const repoAccess = { assertLevelAtLeast: vi.fn() };
  let facade: RepositoriesFacade;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver.firstWorkspaceForUser.mockResolvedValue(workspace);
    repoAccess.assertLevelAtLeast.mockResolvedValue(true);
    vi.mocked(usersRepo.getById).mockResolvedValue(user);
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(membership);
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
    expect(repoAccess.assertLevelAtLeast).not.toHaveBeenCalled();
  });

  it("denies activation below live GitHub admin permission", async () => {
    repoAccess.assertLevelAtLeast.mockResolvedValue(false);

    await expectCoreException(
      facade.setEnabled({
        user: { id: user.id, login: user.login },
        repositoryId: repository.id,
        enabled: true,
      }),
      403,
    );
    expect(repoAccess.assertLevelAtLeast).toHaveBeenCalledWith(
      { owner: repository.owner, repo: repository.name, username: user.login },
      "admin",
    );
    expect(repositoriesRepo.setFolioEnabled).not.toHaveBeenCalled();
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
