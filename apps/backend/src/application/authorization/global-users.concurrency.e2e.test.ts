import { type Db, closeDb, getDb, runMigrations, usersRepo } from "@folio/db";
import { GLOBAL_STATUS } from "@folio/types";
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
    adminUserId = admin.id;
    targetUserId = target.id;
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

  it("rejects a stale suspend after transfer promotes and commits the target", async () => {
    const suspendReady = deferred();
    const releaseSuspend = deferred();
    const original = usersRepo.setGlobalStatusIfCurrent.bind(usersRepo);
    const suspendSpy = vi
      .spyOn(usersRepo, "setGlobalStatusIfCurrent")
      .mockImplementation(async (id, expected, next, transaction, conditions) => {
        suspendReady.resolve();
        await releaseSuspend.promise;
        return original(id, expected, next, transaction, conditions);
      });

    try {
      const suspendResult = facade.suspend({
        actorUserId: adminUserId,
        targetUserId,
      });
      await suspendReady.promise;
      await facade.transferSystemAdmin({ actorUserId: adminUserId, targetUserId });
      releaseSuspend.resolve();

      await expect(suspendResult).rejects.toBeInstanceOf(CoreException);
      await expectSoleActiveAdmin(targetUserId);
    } finally {
      releaseSuspend.resolve();
      suspendSpy.mockRestore();
    }
  });

  it("rolls back transfer demotion when suspend commits before target promotion", async () => {
    const promotionReady = deferred();
    const releasePromotion = deferred();
    const original = usersRepo.setSystemAdminIfCurrent.bind(usersRepo);
    let systemAdminWrites = 0;
    const transferSpy = vi
      .spyOn(usersRepo, "setSystemAdminIfCurrent")
      .mockImplementation(async (id, expected, expectedStatus, value, transaction) => {
        systemAdminWrites += 1;
        if (systemAdminWrites === 2) {
          promotionReady.resolve();
          await releasePromotion.promise;
        }
        return original(id, expected, expectedStatus, value, transaction);
      });

    try {
      const transferResult = facade.transferSystemAdmin({
        actorUserId: adminUserId,
        targetUserId,
      });
      await promotionReady.promise;
      await facade.suspend({ actorUserId: adminUserId, targetUserId });
      releasePromotion.resolve();

      await expect(transferResult).rejects.toBeInstanceOf(CoreException);
      await expectSoleActiveAdmin(adminUserId);
      await expect(usersRepo.getById(targetUserId, db)).resolves.toMatchObject({
        globalStatus: GLOBAL_STATUS.SUSPENDED,
        isSystemAdmin: false,
      });
    } finally {
      releasePromotion.resolve();
      transferSpy.mockRestore();
    }
  });
});
