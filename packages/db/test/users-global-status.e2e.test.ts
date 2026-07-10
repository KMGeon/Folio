import { GLOBAL_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { usersRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("usersRepo global status + system admin (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("defaults new users to pending global status", async () => {
    const u = await usersRepo.create({ githubUserId: 1, login: "a", avatarUrl: "x" }, db);
    expect(u.globalStatus).toBe(GLOBAL_STATUS.PENDING);
    expect(u.isSystemAdmin).toBe(false);
  });

  it("promotes exactly one system admin", async () => {
    const u = await usersRepo.create({ githubUserId: 2, login: "b", avatarUrl: "x" }, db);
    await usersRepo.setSystemAdmin(u.id, true, db);
    expect((await usersRepo.getSystemAdmin(db))?.id).toBe(u.id);

    const other = await usersRepo.create({ githubUserId: 3, login: "c", avatarUrl: "x" }, db);
    await expect(usersRepo.setSystemAdmin(other.id, true, db)).rejects.toThrow();
  });

  it("moves a user through global status transitions", async () => {
    const u = await usersRepo.create({ githubUserId: 4, login: "d", avatarUrl: "x" }, db);
    const active = await usersRepo.setGlobalStatus(u.id, GLOBAL_STATUS.ACTIVE, db);
    expect(active?.globalStatus).toBe(GLOBAL_STATUS.ACTIVE);
  });

  it("atomically activates and promotes the initial system admin", async () => {
    const user = await usersRepo.create({ githubUserId: 5, login: "e", avatarUrl: "x" }, db);

    const admin = await usersRepo.bootstrapInitialSystemAdmin(5, db);

    expect(admin).toMatchObject({
      id: user.id,
      globalStatus: GLOBAL_STATUS.ACTIVE,
      isSystemAdmin: true,
    });
  });

  it("serializes concurrent bootstrap attempts so only one user becomes admin", async () => {
    const first = await usersRepo.create({ githubUserId: 6, login: "f", avatarUrl: "x" }, db);
    const second = await usersRepo.create({ githubUserId: 7, login: "g", avatarUrl: "x" }, db);

    const results = await Promise.all([
      usersRepo.bootstrapInitialSystemAdmin(6, db),
      usersRepo.bootstrapInitialSystemAdmin(7, db),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const users = await usersRepo.listAll(db);
    expect(users.filter((user) => user.isSystemAdmin)).toHaveLength(1);
    expect(users.filter((user) => user.globalStatus === GLOBAL_STATUS.ACTIVE)).toHaveLength(1);
    expect([first.id, second.id]).toContain(users.find((user) => user.isSystemAdmin)?.id);
  });

  it("legacy approval dual-writes both authorization lifecycle fields", async () => {
    const user = await usersRepo.create({ githubUserId: 8, login: "h", avatarUrl: "x" }, db);

    const approved = await usersRepo.approve(user.id, db);

    expect(approved).toMatchObject({
      status: "approved",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    });
  });

  it("legacy approval does not reactivate a suspended user", async () => {
    const user = await usersRepo.create(
      {
        githubUserId: 9,
        login: "i",
        avatarUrl: "x",
        globalStatus: GLOBAL_STATUS.SUSPENDED,
      },
      db,
    );

    await expect(usersRepo.approve(user.id, db)).resolves.toBeNull();
    expect(await usersRepo.getById(user.id, db)).toMatchObject({
      status: "pending",
      globalStatus: GLOBAL_STATUS.SUSPENDED,
    });
  });

  it("legacy approval does not rewrite an already-active user", async () => {
    const user = await usersRepo.create(
      {
        githubUserId: 10,
        login: "j",
        avatarUrl: "x",
        globalStatus: GLOBAL_STATUS.ACTIVE,
      },
      db,
    );

    await expect(usersRepo.approve(user.id, db)).resolves.toBeNull();
    expect(await usersRepo.getById(user.id, db)).toMatchObject({
      status: "pending",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    });
  });
});
