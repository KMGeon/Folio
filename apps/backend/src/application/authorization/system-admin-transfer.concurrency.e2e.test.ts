import { type Db, auditLogs, closeDb, getDb, runMigrations, users, usersRepo } from "@folio/db";
import { AUDIT_ACTION, GLOBAL_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { GlobalUsersFacade } from "./global-users.facade.js";

const d = process.env.SUPABASE_DATABASE_URL ? describe : describe.skip;

d("system-admin transfer concurrency (e2e)", () => {
  let db: Db;
  const facade = new GlobalUsersFacade();

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.delete(users);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("allows exactly one concurrent transfer from the same system admin", async () => {
    const actor = await usersRepo.create(
      {
        githubUserId: 1,
        login: "actor",
        avatarUrl: "x",
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: true,
      },
      db,
    );
    const first = await usersRepo.create(
      {
        githubUserId: 2,
        login: "first",
        avatarUrl: "x",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );
    const second = await usersRepo.create(
      {
        githubUserId: 3,
        login: "second",
        avatarUrl: "x",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );

    const results = await Promise.allSettled([
      facade.transferSystemAdmin({ actorUserId: actor.id, targetUserId: first.id }),
      facade.transferSystemAdmin({ actorUserId: actor.id, targetUserId: second.id }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toBeDefined();
    if (!rejected) {
      throw new Error("expected one transfer to be rejected");
    }
    expect(rejected.reason).toBeInstanceOf(CoreException);
    expect((rejected.reason as CoreException).errorType).toBe(ErrorType.GlobalUserConflict);

    const allUsers = await usersRepo.listAll(db);
    expect(allUsers.filter((user) => user.isSystemAdmin)).toHaveLength(1);
    expect([first.id, second.id]).toContain(allUsers.find((user) => user.isSystemAdmin)?.id);
    const transfers = (await db.select().from(auditLogs)).filter(
      (row) => row.action === AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER,
    );
    expect(transfers).toHaveLength(1);
  });
});
