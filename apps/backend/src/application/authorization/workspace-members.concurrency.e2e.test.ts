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
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";

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

d("workspace member mutation concurrency (e2e)", () => {
  let db: Db;
  let facade: WorkspaceMembersFacade;
  let service: WorkspaceMembershipService;
  let workspaceId: string;
  let systemAdminUserId: string;
  let ownerUserId: string;
  let targetUserId: string;

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.execute("truncate table audit_logs, workspace_members, workspaces, users cascade");
    const workspace = await workspacesRepo.create(
      {
        githubAccountId: 91,
        accountLogin: "concurrency-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    const systemAdmin = await usersRepo.create(
      {
        githubUserId: 900,
        login: "system-admin",
        avatarUrl: "https://avatars/system-admin",
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: true,
      },
      db,
    );
    const owner = await usersRepo.create(
      {
        githubUserId: 901,
        login: "owner",
        avatarUrl: "https://avatars/owner",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    const target = await usersRepo.create(
      {
        githubUserId: 902,
        login: "target",
        avatarUrl: "https://avatars/target",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    workspaceId = workspace.id;
    systemAdminUserId = systemAdmin.id;
    ownerUserId = owner.id;
    targetUserId = target.id;
    await workspaceMembersRepo.create(
      {
        workspaceId,
        userId: ownerUserId,
        role: WORKSPACE_ROLE.OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId,
        userId: targetUserId,
        role: WORKSPACE_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    service = new WorkspaceMembershipService();
    facade = new WorkspaceMembersFacade(service);
  });

  afterAll(async () => {
    await closeDb();
  });

  async function run(operation: "transfer" | "suspend" | "remove"): Promise<void> {
    const command = { workspaceId, actorUserId: ownerUserId, targetUserId };
    if (operation === "transfer") {
      return facade.transferOwnership(command);
    }
    return facade[operation](command);
  }

  async function race(
    first: "transfer" | "suspend" | "remove",
    second: "transfer" | "suspend" | "remove",
  ) {
    const firstLocked = deferred();
    const releaseFirst = deferred();
    const original = workspaceMembersRepo.getMembershipsForUpdate.bind(workspaceMembersRepo);
    let lockCalls = 0;
    const lockSpy = vi
      .spyOn(workspaceMembersRepo, "getMembershipsForUpdate")
      .mockImplementation(async (requestedWorkspaceId, userIds, transaction) => {
        const rows = await original(requestedWorkspaceId, userIds, transaction);
        lockCalls += 1;
        if (lockCalls === 1) {
          firstLocked.resolve();
          await releaseFirst.promise;
        }
        return rows;
      });

    try {
      const firstResult = run(first);
      await firstLocked.promise;
      const secondResult = run(second);
      releaseFirst.resolve();
      return await Promise.allSettled([firstResult, secondResult]);
    } finally {
      releaseFirst.resolve();
      lockSpy.mockRestore();
    }
  }

  async function expectActiveSoleOwner(): Promise<void> {
    const memberships = await workspaceMembersRepo.listByWorkspace(workspaceId, db);
    const owners = memberships.filter((membership) => membership.role === WORKSPACE_ROLE.OWNER);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
  }

  it.each(["suspend", "remove"] as const)(
    "keeps an active sole owner when transfer locks before %s",
    async (operation) => {
      const results = await race("transfer", operation);

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
      await expectActiveSoleOwner();
    },
  );

  it.each(["suspend", "remove"] as const)(
    "keeps an active sole owner when %s locks before transfer",
    async (operation) => {
      const results = await race(operation, "transfer");

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
      await expectActiveSoleOwner();
    },
  );

  it("rolls back a standalone status update when its audit insert fails", async () => {
    const target = await workspaceMembersRepo.getMembership(workspaceId, targetUserId, db);
    expect(target).not.toBeNull();

    await expect(
      service.suspendReviewer({
        workspaceId,
        membershipId: target?.id ?? "missing",
        actorUserId: ownerUserId,
        targetUserId: "not-a-uuid",
        expectedRole: WORKSPACE_ROLE.REVIEWER,
      }),
    ).rejects.toThrow();

    await expect(
      workspaceMembersRepo.getMembership(workspaceId, targetUserId, db),
    ).resolves.toMatchObject({ status: MEMBERSHIP_STATUS.ACTIVE });
  });

  it("rejects a member mutation that waits behind global suspension of its actor", async () => {
    const suspensionLocked = deferred();
    const releaseSuspension = deferred();
    const memberAttemptedActorLock = deferred();
    const originalGlobalLock = usersRepo.getByIdsForUpdate.bind(usersRepo);
    const originalMemberActorLock = usersRepo.getByIdForUpdate.bind(usersRepo);
    const globalLockSpy = vi
      .spyOn(usersRepo, "getByIdsForUpdate")
      .mockImplementation(async (...args) => {
        const rows = await originalGlobalLock(...args);
        suspensionLocked.resolve();
        await releaseSuspension.promise;
        return rows;
      });
    const memberLockSpy = vi.spyOn(usersRepo, "getByIdForUpdate").mockImplementation((...args) => {
      memberAttemptedActorLock.resolve();
      return originalMemberActorLock(...args);
    });

    try {
      const suspension = new GlobalUsersFacade().suspend({
        actorUserId: systemAdminUserId,
        targetUserId: ownerUserId,
      });
      await suspensionLocked.promise;
      const mutation = facade.suspend({
        workspaceId,
        actorUserId: ownerUserId,
        targetUserId,
      });
      await memberAttemptedActorLock.promise;
      releaseSuspension.resolve();

      await expect(suspension).resolves.toBeUndefined();
      await expect(mutation).rejects.toMatchObject({ errorType: ErrorType.Forbidden });
      await expect(
        workspaceMembersRepo.getMembership(workspaceId, targetUserId, db),
      ).resolves.toMatchObject({ status: MEMBERSHIP_STATUS.ACTIVE });
      const audits = await auditLogsRepo.listByWorkspace(workspaceId, db);
      expect(audits).toEqual([]);
    } finally {
      releaseSuspension.resolve();
      globalLockSpy.mockRestore();
      memberLockSpy.mockRestore();
    }
  });

  it("rolls back a failed ownership-transfer audit before waiting suspension commits", async () => {
    const transferReachedAudit = deferred();
    const releaseTransferAudit = deferred();
    const suspensionAttempted = deferred();
    const originalGlobalLock = usersRepo.getByIdsForUpdate.bind(usersRepo);
    const globalLockSpy = vi.spyOn(usersRepo, "getByIdsForUpdate").mockImplementation((...args) => {
      suspensionAttempted.resolve();
      return originalGlobalLock(...args);
    });
    const auditSpy = vi.spyOn(auditLogsRepo, "record").mockImplementationOnce(async () => {
      transferReachedAudit.resolve();
      await releaseTransferAudit.promise;
      throw new Error("transfer audit failed");
    });

    try {
      const transfer = facade.transferOwnership({
        workspaceId,
        actorUserId: ownerUserId,
        targetUserId,
      });
      await transferReachedAudit.promise;
      const suspension = new GlobalUsersFacade().suspend({
        actorUserId: systemAdminUserId,
        targetUserId: ownerUserId,
      });
      await suspensionAttempted.promise;
      releaseTransferAudit.resolve();

      await expect(transfer).rejects.toThrow("transfer audit failed");
      await expect(suspension).resolves.toBeUndefined();
      await expect(
        workspaceMembersRepo.getMembership(workspaceId, ownerUserId, db),
      ).resolves.toMatchObject({ role: WORKSPACE_ROLE.OWNER });
      await expect(
        workspaceMembersRepo.getMembership(workspaceId, targetUserId, db),
      ).resolves.toMatchObject({ role: WORKSPACE_ROLE.REVIEWER });
      const audits = await auditLogsRepo.listByWorkspace(workspaceId, db);
      expect(audits.filter((row) => row.action === AUDIT_ACTION.OWNER_TRANSFER)).toEqual([]);
    } finally {
      releaseTransferAudit.resolve();
      globalLockSpy.mockRestore();
      auditSpy.mockRestore();
    }
  });
});
