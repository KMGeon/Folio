import { ACCOUNT_TYPE, AUDIT_ACTION } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { auditLogsRepo, usersRepo, workspacesRepo } from "../src/repos/index.js";
import type { AuditLogInsert } from "../src/schema/audit-logs.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

// Authorization audit records must always capture both sides of the state transition.
// @ts-expect-error `before` is required for every explicit authorization audit insert.
const missingBefore: AuditLogInsert = {
  actorUserId: "00000000-0000-0000-0000-000000000001",
  action: AUDIT_ACTION.ROLE_CHANGE,
  targetType: "workspace_member",
  targetId: "00000000-0000-0000-0000-000000000002",
  after: { role: "admin" },
};

// @ts-expect-error `after` is required for every explicit authorization audit insert.
const missingAfter: AuditLogInsert = {
  actorUserId: "00000000-0000-0000-0000-000000000001",
  action: AUDIT_ACTION.ROLE_CHANGE,
  targetType: "workspace_member",
  targetId: "00000000-0000-0000-0000-000000000002",
  before: { role: "reviewer" },
};

void missingBefore;
void missingAfter;

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
