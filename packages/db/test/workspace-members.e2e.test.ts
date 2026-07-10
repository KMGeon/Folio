import { ACCOUNT_TYPE, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { usersRepo, workspaceMembersRepo, workspacesRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("workspaceMembersRepo (e2e)", () => {
  let db: Db;
  let workspaceId: string;
  let userId: string;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
    const ws = await workspacesRepo.create(
      { githubAccountId: 1, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    workspaceId = ws.id;
    const user = await usersRepo.create(
      { githubUserId: 100, login: "octocat", avatarUrl: "x" },
      db,
    );
    userId = user.id;
  });
  afterAll(async () => {
    await closeDb();
  });

  it("creates and reads a membership", async () => {
    await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );
    const found = await workspaceMembersRepo.getMembership(workspaceId, userId, db);
    expect(found?.role).toBe(WORKSPACE_ROLE.REVIEWER);
    expect(found?.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
  });

  it("rejects a second owner in the same workspace", async () => {
    const other = await usersRepo.create({ githubUserId: 200, login: "hubot", avatarUrl: "x" }, db);
    await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );
    await expect(
      workspaceMembersRepo.create(
        {
          workspaceId,
          userId: other.id,
          role: WORKSPACE_ROLE.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        db,
      ),
    ).rejects.toThrow();
  });
});
