import { ACCOUNT_TYPE, AUDIT_ACTION } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { auditLogsRepo, usersRepo, workspacesRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("auditLogsRepo (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("records an action with before/after and lists it by workspace", async () => {
    const ws = await workspacesRepo.create(
      { githubAccountId: 5, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    const actor = await usersRepo.create({ githubUserId: 1, login: "root", avatarUrl: "x" }, db);
    await auditLogsRepo.record(
      {
        actorUserId: actor.id,
        action: AUDIT_ACTION.ROLE_CHANGE,
        targetType: "workspace_member",
        targetId: actor.id,
        workspaceId: ws.id,
        before: { role: "reviewer" },
        after: { role: "admin" },
      },
      db,
    );
    const logs = await auditLogsRepo.listByWorkspace(ws.id, db);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe(AUDIT_ACTION.ROLE_CHANGE);
    expect(logs[0]?.after).toEqual({ role: "admin" });
  });
});
