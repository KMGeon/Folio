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

  it("updates status only from the expected current status", async () => {
    const membership = await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );

    const suspended = await workspaceMembersRepo.updateStatusIfCurrent(
      membership.id,
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      userId,
      db,
    );
    const repeated = await workspaceMembersRepo.updateStatusIfCurrent(
      membership.id,
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      userId,
      db,
    );

    expect(suspended?.status).toBe(MEMBERSHIP_STATUS.SUSPENDED);
    expect(suspended?.suspendedBy).toBe(userId);
    expect(repeated).toBeNull();
  });

  it("requires both the expected role and status for status transitions", async () => {
    const membership = await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );

    const wrongRole = await workspaceMembersRepo.updateStatusIfCurrent(
      membership.id,
      WORKSPACE_ROLE.ADMIN,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      userId,
      db,
    );

    expect(wrongRole).toBeNull();
    await expect(
      workspaceMembersRepo.getMembership(workspaceId, userId, db),
    ).resolves.toMatchObject({
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });
  });

  it("updates role only from the expected current role", async () => {
    const membership = await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );

    const elevated = await workspaceMembersRepo.updateRoleIfCurrent(
      membership.id,
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      WORKSPACE_ROLE.ADMIN,
      userId,
      db,
    );
    const stale = await workspaceMembersRepo.updateRoleIfCurrent(
      membership.id,
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      WORKSPACE_ROLE.OWNER,
      userId,
      db,
    );

    expect(elevated?.role).toBe(WORKSPACE_ROLE.ADMIN);
    expect(elevated?.elevatedBy).toBe(userId);
    expect(stale).toBeNull();
  });

  it("requires both the expected role and status for role transitions", async () => {
    const membership = await workspaceMembersRepo.create(
      {
        workspaceId,
        userId,
        role: WORKSPACE_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.SUSPENDED,
      },
      db,
    );

    const inactive = await workspaceMembersRepo.updateRoleIfCurrent(
      membership.id,
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      WORKSPACE_ROLE.OWNER,
      userId,
      db,
    );

    expect(inactive).toBeNull();
    await expect(
      workspaceMembersRepo.getMembership(workspaceId, userId, db),
    ).resolves.toMatchObject({
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    });
  });

  it("locks requested memberships in deterministic user-id order", async () => {
    const other = await usersRepo.create({ githubUserId: 200, login: "hubot", avatarUrl: "x" }, db);
    await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId,
        userId: other.id,
        role: WORKSPACE_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );

    await db.transaction(async (transaction) => {
      const rows = await workspaceMembersRepo.getMembershipsForUpdate(
        workspaceId,
        [other.id, userId],
        transaction,
      );
      expect(rows.map((row) => row.userId)).toEqual([other.id, userId].sort());
    });
  });
});
