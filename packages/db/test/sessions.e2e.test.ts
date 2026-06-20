import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { sessionsRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";
import { type BaseFixture, seedBase } from "./helpers/fixtures.js";

const d = HAS_DB ? describe : describe.skip;

d("sessionsRepo (e2e)", () => {
  let db: Db;
  let base: BaseFixture;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
    base = await seedBase(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates and looks up a session by token hash", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const created = await sessionsRepo.create(
      { userId: base.userId, tokenHash: "hash-1", expiresAt },
      db,
    );
    expect(created.tokenHash).toBe("hash-1");

    const found = await sessionsRepo.getByTokenHash("hash-1", db);
    expect(found?.id).toBe(created.id);
    expect(found?.userId).toBe(base.userId);

    expect(await sessionsRepo.getByTokenHash("missing", db)).toBeNull();
  });

  it("deletes a session by token hash", async () => {
    await sessionsRepo.create(
      { userId: base.userId, tokenHash: "hash-2", expiresAt: new Date(Date.now() + 60_000) },
      db,
    );
    await sessionsRepo.deleteByTokenHash("hash-2", db);
    expect(await sessionsRepo.getByTokenHash("hash-2", db)).toBeNull();
  });

  it("deleteExpired removes only past-due sessions", async () => {
    await sessionsRepo.create(
      { userId: base.userId, tokenHash: "old", expiresAt: new Date(Date.now() - 1_000) },
      db,
    );
    await sessionsRepo.create(
      { userId: base.userId, tokenHash: "fresh", expiresAt: new Date(Date.now() + 60_000) },
      db,
    );
    await sessionsRepo.deleteExpired(new Date(), db);
    expect(await sessionsRepo.getByTokenHash("old", db)).toBeNull();
    expect(await sessionsRepo.getByTokenHash("fresh", db)).not.toBeNull();
  });
});
