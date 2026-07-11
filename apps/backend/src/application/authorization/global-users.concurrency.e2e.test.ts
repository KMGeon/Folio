import {
  type Db,
  auditLogs,
  auditLogsRepo,
  closeDb,
  getDb,
  runMigrations,
  usersRepo,
} from "@folio/db";
import { AUDIT_ACTION, GLOBAL_STATUS, type AuditAction } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { GlobalUsersFacade } from "./global-users.facade.js";

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

d("global user mutation concurrency (e2e)", () => {
  let db: Db;
  let facade: GlobalUsersFacade;
  let adminUserId: string;
  let targetUserId: string;
  let otherTargetUserId: string;
  let pendingUserId: string;

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.execute("truncate table audit_logs, sessions, users cascade");
    const admin = await usersRepo.create(
      {
        githubUserId: 951,
        login: "global-admin",
        avatarUrl: "https://avatars/global-admin",
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: true,
      },
      db,
    );
    const target = await usersRepo.create(
      {
        githubUserId: 952,
        login: "global-target",
        avatarUrl: "https://avatars/global-target",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    const otherTarget = await usersRepo.create(
      {
        githubUserId: 953,
        login: "global-other-target",
        avatarUrl: "https://avatars/global-other-target",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    const pending = await usersRepo.create(
      {
        githubUserId: 954,
        login: "global-pending",
        avatarUrl: "https://avatars/global-pending",
      },
      db,
    );
    adminUserId = admin.id;
    targetUserId = target.id;
    otherTargetUserId = otherTarget.id;
    pendingUserId = pending.id;
    facade = new GlobalUsersFacade();
  });

  afterAll(async () => {
    await closeDb();
  });

  async function expectSoleActiveAdmin(expectedUserId: string): Promise<void> {
    const users = await usersRepo.listAll(db);
    const admins = users.filter((user) => user.isSystemAdmin);
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      id: expectedUserId,
      globalStatus: GLOBAL_STATUS.ACTIVE,
    });
  }

  async function expectAuditActions(expected: AuditAction[]): Promise<void> {
    const rows = await db.select().from(auditLogs);
    expect(rows.map((row) => row.action).sort()).toEqual([...expected].sort());
  }

  async function raceWithFirstUserLocks(
    first: () => Promise<void>,
    second: () => Promise<void>,
  ): Promise<PromiseSettledResult<void>[]> {
    const firstLocked = deferred();
    const secondAttemptedLock = deferred();
    const releaseFirst = deferred();
    const original = usersRepo.getByIdsForUpdate.bind(usersRepo);
    let lockCalls = 0;
    const lockSpy = vi
      .spyOn(usersRepo, "getByIdsForUpdate")
      .mockImplementation(async (userIds, transaction) => {
        lockCalls += 1;
        const call = lockCalls;
        if (call === 2) {
          secondAttemptedLock.resolve();
        }
        const rows = await original(userIds, transaction);
        if (call === 1) {
          firstLocked.resolve();
          await releaseFirst.promise;
        }
        return rows;
      });

    try {
      const firstResult = first();
      await firstLocked.promise;
      const secondResult = second();
      await secondAttemptedLock.promise;
      releaseFirst.resolve();
      return await Promise.allSettled([firstResult, secondResult]);
    } finally {
      releaseFirst.resolve();
      lockSpy.mockRestore();
    }
  }

  it("rejects approve by the former admin after transfer commits", async () => {
    const results = await raceWithFirstUserLocks(
      () => facade.transferSystemAdmin({ actorUserId: adminUserId, targetUserId }),
      () => facade.approve({ actorUserId: adminUserId, targetUserId: pendingUserId }),
    );

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(results[1]).toMatchObject({ reason: expect.any(CoreException) });
    await expectSoleActiveAdmin(targetUserId);
    await expect(usersRepo.getById(pendingUserId, db)).resolves.toMatchObject({
      globalStatus: GLOBAL_STATUS.PENDING,
    });
    await expectAuditActions([AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER]);
  });

  it("commits approve before a transfer that waited on the same actor", async () => {
    const results = await raceWithFirstUserLocks(
      () => facade.approve({ actorUserId: adminUserId, targetUserId: pendingUserId }),
      () => facade.transferSystemAdmin({ actorUserId: adminUserId, targetUserId }),
    );

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    await expectSoleActiveAdmin(targetUserId);
    await expect(usersRepo.getById(pendingUserId, db)).resolves.toMatchObject({
      globalStatus: GLOBAL_STATUS.ACTIVE,
    });
    await expectAuditActions([AUDIT_ACTION.USER_APPROVE, AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER]);
  });

  it.each([
    ["transfer", "suspend"],
    ["suspend", "transfer"],
  ] as const)("serializes %s before %s without stale authority", async (first, second) => {
    const operations = {
      transfer: () => facade.transferSystemAdmin({ actorUserId: adminUserId, targetUserId }),
      suspend: () => facade.suspend({ actorUserId: adminUserId, targetUserId }),
    };
    const results = await raceWithFirstUserLocks(operations[first], operations[second]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    await expectSoleActiveAdmin(first === "transfer" ? targetUserId : adminUserId);
    if (first === "suspend") {
      await expect(usersRepo.getById(targetUserId, db)).resolves.toMatchObject({
        globalStatus: GLOBAL_STATUS.SUSPENDED,
        isSystemAdmin: false,
      });
    }
    await expectAuditActions([
      first === "transfer" ? AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER : AUDIT_ACTION.USER_SUSPEND,
    ]);
  });

  it("allows only one of two concurrent transfers from the same admin", async () => {
    const results = await raceWithFirstUserLocks(
      () => facade.transferSystemAdmin({ actorUserId: adminUserId, targetUserId }),
      () =>
        facade.transferSystemAdmin({
          actorUserId: adminUserId,
          targetUserId: otherTargetUserId,
        }),
    );

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    await expectSoleActiveAdmin(targetUserId);
    await expect(usersRepo.getById(otherTargetUserId, db)).resolves.toMatchObject({
      globalStatus: GLOBAL_STATUS.ACTIVE,
      isSystemAdmin: false,
    });
    await expectAuditActions([AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER]);
  });

  it("rolls back both transfer writes when its audit insert fails", async () => {
    const auditSpy = vi.spyOn(auditLogsRepo, "record").mockRejectedValue(new Error("audit failed"));

    try {
      await expect(
        facade.transferSystemAdmin({ actorUserId: adminUserId, targetUserId }),
      ).rejects.toThrow("audit failed");
      await expectSoleActiveAdmin(adminUserId);
      await expect(usersRepo.getById(targetUserId, db)).resolves.toMatchObject({
        isSystemAdmin: false,
      });
      await expect(db.select().from(auditLogs)).resolves.toEqual([]);
    } finally {
      auditSpy.mockRestore();
    }
  });
});
