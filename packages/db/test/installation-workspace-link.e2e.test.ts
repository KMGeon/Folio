import { ACCOUNT_TYPE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { installationsRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("installations workspace link (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("stores and queries installations by github account id", async () => {
    const inst = await installationsRepo.create(
      { githubInstallationId: 99, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    await installationsRepo.setGithubAccountId(inst.id, 4242, db);
    const found = await installationsRepo.listByWorkspaceAccountId(4242, db);
    expect(found.map((i) => i.id)).toContain(inst.id);
  });
});
