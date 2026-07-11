import {
  type Db,
  auditLogsRepo,
  closeDb,
  getDb,
  installationsRepo,
  repositoriesRepo,
  runMigrations,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import {
  ACCOUNT_TYPE,
  AUDIT_ACTION,
  GLOBAL_STATUS,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
} from "@folio/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { GlobalUsersFacade } from "../authorization/global-users.facade.js";
import { WorkspaceClaimFacade } from "../authorization/workspace-claim.facade.js";
import { WorkspaceMembersFacade } from "../authorization/workspace-members.facade.js";
import { RepositoriesFacade } from "./repositories.facade.js";

const HAS_DB = Boolean(process.env.SUPABASE_DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

d("repository activation authority concurrency (e2e)", () => {
  let db: Db;
  let repositories: RepositoriesFacade;
  let globalUsers: GlobalUsersFacade;
  let claims: WorkspaceClaimFacade;
  let workspaceMembers: WorkspaceMembersFacade;
  let workspaceId: string;
  let repositoryId: string;
  let systemAdminUserId: string;
  let ownerUserId: string;
  let activationUserId: string;

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.execute(
      "truncate table audit_logs, repositories, installations, workspace_members, workspaces, sessions, users cascade",
    );
    const workspace = await workspacesRepo.create(
      {
        githubAccountId: 991,
        accountLogin: "activation-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    const installation = await installationsRepo.create(
      {
        githubInstallationId: 992,
        githubAccountId: workspace.githubAccountId,
        accountLogin: workspace.accountLogin,
        accountType: workspace.accountType,
      },
      db,
    );
    const repository = await repositoriesRepo.create(
      {
        installationId: installation.id,
        workspaceId: workspace.id,
        githubRepoId: 993,
        owner: workspace.accountLogin,
        name: "folio",
        fullName: `${workspace.accountLogin}/folio`,
        private: true,
        defaultBranch: "main",
      },
      db,
    );
    const systemAdmin = await usersRepo.create(
      {
        githubUserId: 994,
        login: "system-admin",
        avatarUrl: "https://avatars/system-admin",
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: true,
      },
      db,
    );
    const owner = await usersRepo.create(
      {
        githubUserId: 995,
        login: "workspace-owner",
        avatarUrl: "https://avatars/workspace-owner",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    const activationUser = await usersRepo.create(
      {
        githubUserId: 996,
        login: "activation-admin",
        avatarUrl: "https://avatars/activation-admin",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId: workspace.id,
        userId: owner.id,
        role: WORKSPACE_ROLE.OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId: workspace.id,
        userId: activationUser.id,
        role: WORKSPACE_ROLE.ADMIN,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );

    workspaceId = workspace.id;
    repositoryId = repository.id;
    systemAdminUserId = systemAdmin.id;
    ownerUserId = owner.id;
    activationUserId = activationUser.id;
    repositories = new RepositoriesFacade(
      { firstWorkspaceForUser: vi.fn().mockResolvedValue(workspace) } as never,
      { assertLiveLevelAtLeast: vi.fn().mockResolvedValue(true) } as never,
    );
    globalUsers = new GlobalUsersFacade();
    claims = new WorkspaceClaimFacade(
      { canUseFeature: vi.fn().mockResolvedValue({ entitled: true }) } as never,
      { firstWorkspaceForUser: vi.fn().mockResolvedValue(workspace) } as never,
      new WorkspaceMembershipService(),
    );
    workspaceMembers = new WorkspaceMembersFacade(new WorkspaceMembershipService());
  });

  afterAll(async () => {
    await closeDb();
  });

  it("serializes global suspension after activation has locked the actor", async () => {
    const activationLocked = deferred();
    const releaseActivation = deferred();
    const suspensionAttempted = deferred();
    const completionOrder: string[] = [];
    const originalLock = usersRepo.getByIdForUpdate.bind(usersRepo);
    const originalSuspend = usersRepo.setGlobalStatusIfCurrent.bind(usersRepo);
    const lockSpy = vi.spyOn(usersRepo, "getByIdForUpdate").mockImplementation(async (...args) => {
      const row = await originalLock(...args);
      activationLocked.resolve();
      await releaseActivation.promise;
      return row;
    });
    const suspendSpy = vi
      .spyOn(usersRepo, "setGlobalStatusIfCurrent")
      .mockImplementation(async (...args) => {
        suspensionAttempted.resolve();
        return originalSuspend(...args);
      });

    try {
      const activation = activate().then((result) => {
        completionOrder.push("activation");
        return result;
      });
      await activationLocked.promise;
      const suspension = globalUsers
        .suspend({ actorUserId: systemAdminUserId, targetUserId: activationUserId })
        .then(() => {
          completionOrder.push("suspension");
        });
      await suspensionAttempted.promise;
      releaseActivation.resolve();

      await expect(activation).resolves.toMatchObject({ folioEnabled: true });
      await expect(suspension).resolves.toBeUndefined();
      expect(completionOrder).toEqual(["activation", "suspension"]);
      await expect(usersRepo.getById(activationUserId, db)).resolves.toMatchObject({
        globalStatus: GLOBAL_STATUS.SUSPENDED,
      });
      await expectActivationAudit();
    } finally {
      releaseActivation.resolve();
      lockSpy.mockRestore();
      suspendSpy.mockRestore();
    }
  });

  it("serializes workspace demotion after activation has locked the membership", async () => {
    const activationLocked = deferred();
    const releaseActivation = deferred();
    const demotionAttempted = deferred();
    const completionOrder: string[] = [];
    const originalLock = workspacesRepo.getByIdForUpdate.bind(workspacesRepo);
    let lockCalls = 0;
    const lockSpy = vi
      .spyOn(workspacesRepo, "getByIdForUpdate")
      .mockImplementation(async (...args) => {
        lockCalls += 1;
        if (lockCalls === 2) {
          demotionAttempted.resolve();
        }
        const rows = await originalLock(...args);
        if (lockCalls === 1) {
          activationLocked.resolve();
          await releaseActivation.promise;
        }
        return rows;
      });

    try {
      const activation = activate().then((result) => {
        completionOrder.push("activation");
        return result;
      });
      await activationLocked.promise;
      const demotion = workspaceMembers
        .changeRole({
          workspaceId,
          actorUserId: ownerUserId,
          targetUserId: activationUserId,
          toRole: WORKSPACE_ROLE.REVIEWER,
        })
        .then(() => {
          completionOrder.push("demotion");
        });
      await demotionAttempted.promise;
      releaseActivation.resolve();

      await expect(activation).resolves.toMatchObject({ folioEnabled: true });
      await expect(demotion).resolves.toBeUndefined();
      expect(completionOrder).toEqual(["activation", "demotion"]);
      await expect(
        workspaceMembersRepo.getMembership(workspaceId, activationUserId, db),
      ).resolves.toMatchObject({ role: WORKSPACE_ROLE.REVIEWER });
      await expectActivationAudit();
    } finally {
      releaseActivation.resolve();
      lockSpy.mockRestore();
    }
  });

  it("serializes workspace claim after activation has locked the workspace", async () => {
    const activationLocked = deferred();
    const releaseActivation = deferred();
    const claimAttempted = deferred();
    const originalActivationLock = workspacesRepo.getByIdForUpdate.bind(workspacesRepo);
    const originalClaimUpsert = workspacesRepo.upsertByGithubAccountId.bind(workspacesRepo);
    const activationSpy = vi
      .spyOn(workspacesRepo, "getByIdForUpdate")
      .mockImplementation(async (...args) => {
        const row = await originalActivationLock(...args);
        activationLocked.resolve();
        await releaseActivation.promise;
        return row;
      });
    const claimSpy = vi
      .spyOn(workspacesRepo, "upsertByGithubAccountId")
      .mockImplementation((...args) => {
        claimAttempted.resolve();
        return originalClaimUpsert(...args);
      });

    try {
      const activation = activate();
      await activationLocked.promise;
      const claim = claims.claimAsOwner({
        userId: activationUserId,
        githubAccountId: 991,
        accountLogin: "activation-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      });
      await claimAttempted.promise;
      releaseActivation.resolve();

      await expect(activation).resolves.toMatchObject({ folioEnabled: true });
      await expect(claim).resolves.toMatchObject({ role: WORKSPACE_ROLE.ADMIN });
      await expectActivationAudit();
    } finally {
      releaseActivation.resolve();
      activationSpy.mockRestore();
      claimSpy.mockRestore();
    }
  });

  it("rolls back activation audit failure before a waiting demotion proceeds", async () => {
    const activationLocked = deferred();
    const releaseActivation = deferred();
    const demotionAttempted = deferred();
    const originalLock = workspacesRepo.getByIdForUpdate.bind(workspacesRepo);
    let lockCalls = 0;
    const lockSpy = vi
      .spyOn(workspacesRepo, "getByIdForUpdate")
      .mockImplementation(async (...args) => {
        lockCalls += 1;
        if (lockCalls === 2) {
          demotionAttempted.resolve();
        }
        const row = await originalLock(...args);
        if (lockCalls === 1) {
          activationLocked.resolve();
          await releaseActivation.promise;
        }
        return row;
      });
    const auditSpy = vi
      .spyOn(auditLogsRepo, "record")
      .mockRejectedValueOnce(new Error("activation audit failed"));

    try {
      const activation = activate();
      await activationLocked.promise;
      const demotion = workspaceMembers.changeRole({
        workspaceId,
        actorUserId: ownerUserId,
        targetUserId: activationUserId,
        toRole: WORKSPACE_ROLE.REVIEWER,
      });
      await demotionAttempted.promise;
      releaseActivation.resolve();

      await expect(activation).rejects.toThrow("activation audit failed");
      await expect(demotion).resolves.toBeUndefined();
      await expect(repositoriesRepo.getById(repositoryId, db)).resolves.toMatchObject({
        folioEnabled: false,
      });
      await expectActivationAudit(0);
    } finally {
      releaseActivation.resolve();
      lockSpy.mockRestore();
      auditSpy.mockRestore();
    }
  });

  function activate() {
    return repositories.setEnabled({
      user: { id: activationUserId, login: "activation-admin" },
      repositoryId,
      enabled: true,
    });
  }

  async function expectActivationAudit(expected = 1): Promise<void> {
    const auditLogs = await auditLogsRepo.listByWorkspace(workspaceId, db);
    expect(
      auditLogs.filter((auditLog) => auditLog.action === AUDIT_ACTION.REPO_ACTIVATION_CHANGE),
    ).toHaveLength(expected);
  }
});
