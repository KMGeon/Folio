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
});
