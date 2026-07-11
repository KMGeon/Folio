import {
  type Db,
  auditLogsRepo,
  closeDb,
  getDb,
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
import { ErrorType } from "../../support/error/error-type.js";
import { GlobalUsersFacade } from "./global-users.facade.js";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";

const HAS_DB = Boolean(process.env.SUPABASE_DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

d("workspace claim concurrency (e2e)", () => {
  let db: Db;
  let systemAdminUserId: string;
  let firstUserId: string;
  let secondUserId: string;

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.execute("truncate table audit_logs, workspace_members, workspaces, users cascade");
    const [systemAdmin, first, second] = await Promise.all([
      usersRepo.create({
        githubUserId: 970,
        login: "system-admin",
        avatarUrl: "https://avatars/system-admin",
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: true,
      }),
      usersRepo.create({
        githubUserId: 971,
        login: "first",
        avatarUrl: "https://avatars/first",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      }),
      usersRepo.create({
        githubUserId: 972,
        login: "second",
        avatarUrl: "https://avatars/second",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      }),
    ]);
    systemAdminUserId = systemAdmin.id;
    firstUserId = first.id;
    secondUserId = second.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  function facade(): WorkspaceClaimFacade {
    return new WorkspaceClaimFacade(
      { canUseFeature: async () => ({ entitled: true }) } as never,
      { firstWorkspaceForUser: async () => null } as never,
      new WorkspaceMembershipService(),
      {
        resolveInstallationIdentity: async () => ({
          githubAccountId: 97,
          accountLogin: "claim-acme",
          accountType: ACCOUNT_TYPE.ORGANIZATION,
        }),
      } as never,
    );
  }

  function input(userId: string) {
    return {
      userId,
      installationId: 123,
    };
  }

  it("serializes simultaneous first claims into one owner and one reviewer", async () => {
    const results = await Promise.all([
      facade().claimAsOwner(input(firstUserId)),
      facade().claimAsOwner(input(secondUserId)),
    ]);
    const workspace = await workspacesRepo.getByGithubAccountId(97, db);
    expect(workspace).not.toBeNull();
    const members = await workspaceMembersRepo.listByWorkspace(workspace?.id ?? "missing", db);
    const audits = await auditLogsRepo.listByWorkspace(workspace?.id ?? "missing", db);

    expect(results.map((row) => row.role).sort()).toEqual(
      [WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.REVIEWER].sort(),
    );
    expect(members.filter((row) => row.role === WORKSPACE_ROLE.OWNER)).toHaveLength(1);
    expect(audits.filter((row) => row.action === AUDIT_ACTION.WORKSPACE_CLAIM)).toHaveLength(1);
  });

  it("rolls back owner creation when its audit insert fails", async () => {
    const auditSpy = vi
      .spyOn(auditLogsRepo, "record")
      .mockRejectedValueOnce(new Error("audit failed"));
    try {
      await expect(facade().claimAsOwner(input(firstUserId))).rejects.toThrow("audit failed");
      const workspace = await workspacesRepo.getByGithubAccountId(97, db);
      if (workspace) {
        await expect(workspaceMembersRepo.listByWorkspace(workspace.id, db)).resolves.toEqual([]);
      }
    } finally {
      auditSpy.mockRestore();
    }
  });

  it("never promotes a suspended existing membership", async () => {
    const workspace = await workspacesRepo.create(
      {
        githubAccountId: 97,
        accountLogin: "claim-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId: workspace.id,
        userId: firstUserId,
        role: WORKSPACE_ROLE.ADMIN,
        status: MEMBERSHIP_STATUS.SUSPENDED,
      },
      db,
    );

    await expect(facade().claimAsOwner(input(firstUserId))).resolves.toMatchObject({
      role: WORKSPACE_ROLE.ADMIN,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    });
    await expect(auditLogsRepo.listByWorkspace(workspace.id, db)).resolves.toEqual([]);
  });

  it("rejects a claim that waits behind global suspension of its actor", async () => {
    const suspensionLocked = deferred();
    const releaseSuspension = deferred();
    const claimAttemptedActorLock = deferred();
    const originalGlobalLock = usersRepo.getByIdsForUpdate.bind(usersRepo);
    const originalClaimLock = usersRepo.getByIdForUpdate.bind(usersRepo);
    const globalLockSpy = vi
      .spyOn(usersRepo, "getByIdsForUpdate")
      .mockImplementation(async (...args) => {
        const rows = await originalGlobalLock(...args);
        suspensionLocked.resolve();
        await releaseSuspension.promise;
        return rows;
      });
    const claimLockSpy = vi.spyOn(usersRepo, "getByIdForUpdate").mockImplementation((...args) => {
      claimAttemptedActorLock.resolve();
      return originalClaimLock(...args);
    });

    try {
      const suspension = new GlobalUsersFacade().suspend({
        actorUserId: systemAdminUserId,
        targetUserId: firstUserId,
      });
      await suspensionLocked.promise;
      const claim = facade().claimAsOwner(input(firstUserId));
      await claimAttemptedActorLock.promise;
      releaseSuspension.resolve();

      await expect(suspension).resolves.toBeUndefined();
      await expect(claim).rejects.toMatchObject({ errorType: ErrorType.Forbidden });
      const workspace = await workspacesRepo.getByGithubAccountId(97, db);
      expect(workspace).toBeNull();
    } finally {
      releaseSuspension.resolve();
      globalLockSpy.mockRestore();
      claimLockSpy.mockRestore();
    }
  });

  it("rolls back a failed claim audit before waiting suspension commits", async () => {
    const claimReachedAudit = deferred();
    const releaseClaimAudit = deferred();
    const suspensionAttempted = deferred();
    const originalGlobalLock = usersRepo.getByIdsForUpdate.bind(usersRepo);
    const globalLockSpy = vi.spyOn(usersRepo, "getByIdsForUpdate").mockImplementation((...args) => {
      suspensionAttempted.resolve();
      return originalGlobalLock(...args);
    });
    const auditSpy = vi.spyOn(auditLogsRepo, "record").mockImplementationOnce(async () => {
      claimReachedAudit.resolve();
      await releaseClaimAudit.promise;
      throw new Error("claim audit failed");
    });

    try {
      const claim = facade().claimAsOwner(input(firstUserId));
      await claimReachedAudit.promise;
      const suspension = new GlobalUsersFacade().suspend({
        actorUserId: systemAdminUserId,
        targetUserId: firstUserId,
      });
      await suspensionAttempted.promise;
      releaseClaimAudit.resolve();

      await expect(claim).rejects.toThrow("claim audit failed");
      await expect(suspension).resolves.toBeUndefined();
      const workspace = await workspacesRepo.getByGithubAccountId(97, db);
      expect(workspace).toBeNull();
      await expect(usersRepo.getById(firstUserId, db)).resolves.toMatchObject({
        globalStatus: GLOBAL_STATUS.SUSPENDED,
      });
    } finally {
      releaseClaimAudit.resolve();
      globalLockSpy.mockRestore();
      auditSpy.mockRestore();
    }
  });

  it("serializes a claim before a member mutation on the same workspace", async () => {
    const workspace = await workspacesRepo.create(
      {
        githubAccountId: 97,
        accountLogin: "claim-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId: workspace.id,
        userId: firstUserId,
        role: WORKSPACE_ROLE.OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId: workspace.id,
        userId: secondUserId,
        role: WORKSPACE_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    const claimLocked = deferred();
    const releaseClaim = deferred();
    const memberAttempted = deferred();
    const originalClaimLock = workspacesRepo.getByGithubAccountIdForUpdate.bind(workspacesRepo);
    const originalMemberLock = workspacesRepo.getByIdForUpdate.bind(workspacesRepo);
    const claimSpy = vi
      .spyOn(workspacesRepo, "getByGithubAccountIdForUpdate")
      .mockImplementation(async (...args) => {
        const row = await originalClaimLock(...args);
        claimLocked.resolve();
        await releaseClaim.promise;
        return row;
      });
    const memberSpy = vi.spyOn(workspacesRepo, "getByIdForUpdate").mockImplementation((...args) => {
      memberAttempted.resolve();
      return originalMemberLock(...args);
    });

    try {
      const claim = facade().claimAsOwner(input(firstUserId));
      await claimLocked.promise;
      const members = new WorkspaceMembersFacade(new WorkspaceMembershipService());
      const suspend = members.suspend({
        workspaceId: workspace.id,
        actorUserId: firstUserId,
        targetUserId: secondUserId,
      });
      await memberAttempted.promise;
      releaseClaim.resolve();

      await expect(claim).resolves.toMatchObject({ role: WORKSPACE_ROLE.OWNER });
      await expect(suspend).resolves.toBeUndefined();
      await expect(
        workspaceMembersRepo.getMembership(workspace.id, secondUserId, db),
      ).resolves.toMatchObject({ status: MEMBERSHIP_STATUS.SUSPENDED });
    } finally {
      releaseClaim.resolve();
      claimSpy.mockRestore();
      memberSpy.mockRestore();
    }
  });
});
