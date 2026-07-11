import { ACCOUNT_TYPE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { workspacesRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("workspacesRepo (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("creates and looks up a workspace by stable github account id", async () => {
    const created = await workspacesRepo.create(
      { githubAccountId: 42, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    const found = await workspacesRepo.getByGithubAccountId(42, db);
    expect(found?.id).toBe(created.id);
    expect(found?.accountLogin).toBe("acme");
  });

  it("upsert keeps the same row across a login rename (reinstall survival)", async () => {
    const first = await workspacesRepo.upsertByGithubAccountId(
      { githubAccountId: 7, accountLogin: "old", accountType: ACCOUNT_TYPE.USER },
      db,
    );
    const second = await workspacesRepo.upsertByGithubAccountId(
      { githubAccountId: 7, accountLogin: "new", accountType: ACCOUNT_TYPE.USER },
      db,
    );
    expect(second.id).toBe(first.id);
    expect(second.accountLogin).toBe("new");
  });

  it("locks a workspace by stable github account id inside a transaction", async () => {
    const created = await workspacesRepo.create(
      { githubAccountId: 42, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );

    await db.transaction(async (transaction) => {
      const locked = await workspacesRepo.getByGithubAccountIdForUpdate(42, transaction);
      expect(locked?.id).toBe(created.id);
    });
  });
});
