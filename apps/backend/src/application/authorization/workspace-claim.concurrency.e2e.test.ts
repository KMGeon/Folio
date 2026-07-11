import {
  type Db,
  auditLogsRepo,
  closeDb,
  getDb,
  runMigrations,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { ACCOUNT_TYPE, AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";

const HAS_DB = Boolean(process.env.SUPABASE_DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d("workspace claim concurrency (e2e)", () => {
  let db: Db;
  let firstUserId: string;
  let secondUserId: string;

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.execute("truncate table audit_logs, workspace_members, workspaces, users cascade");
    const [first, second] = await Promise.all([
      usersRepo.create({ githubUserId: 971, login: "first", avatarUrl: "https://avatars/first" }),
      usersRepo.create({ githubUserId: 972, login: "second", avatarUrl: "https://avatars/second" }),
    ]);
    firstUserId = first.id;
    secondUserId = second.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  function facade(): WorkspaceClaimFacade {
    return new WorkspaceClaimFacade(
      { canUseFeature: async () => ({ entitled: true }) } as never,
      { firstWorkspaceForUser: async () => null } as never,
      new WorkspaceMembershipService(),
    );
  }

  function input(userId: string) {
    return {
      userId,
      githubAccountId: 97,
      accountLogin: "claim-acme",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    };
  }

  it("serializes simultaneous first claims into one owner and one reviewer", async () => {
    const results = await Promise.all([
      facade().claimAsOwner(input(firstUserId)),
      facade().claimAsOwner(input(secondUserId)),
    ]);
    const workspace = await workspacesRepo.getByGithubAccountId(97, db);
    expect(workspace).not.toBeNull();
    const members = await workspaceMembersRepo.listByWorkspace(workspace?.id ?? "missing", db);
    const audits = await auditLogsRepo.listByWorkspace(workspace?.id ?? "missing", db);

    expect(results.map((row) => row.role).sort()).toEqual(
      [WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.REVIEWER].sort(),
    );
    expect(members.filter((row) => row.role === WORKSPACE_ROLE.OWNER)).toHaveLength(1);
    expect(audits.filter((row) => row.action === AUDIT_ACTION.WORKSPACE_CLAIM)).toHaveLength(1);
  });

  it("rolls back owner creation when its audit insert fails", async () => {
    const auditSpy = vi
      .spyOn(auditLogsRepo, "record")
      .mockRejectedValueOnce(new Error("audit failed"));
    try {
      await expect(facade().claimAsOwner(input(firstUserId))).rejects.toThrow("audit failed");
      const workspace = await workspacesRepo.getByGithubAccountId(97, db);
      if (workspace) {
        await expect(workspaceMembersRepo.listByWorkspace(workspace.id, db)).resolves.toEqual([]);
      }
    } finally {
      auditSpy.mockRestore();
    }
  });

  it("never promotes a suspended existing membership", async () => {
    const workspace = await workspacesRepo.create(
      {
        githubAccountId: 97,
        accountLogin: "claim-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId: workspace.id,
        userId: firstUserId,
        role: WORKSPACE_ROLE.ADMIN,
        status: MEMBERSHIP_STATUS.SUSPENDED,
      },
      db,
    );

    await expect(facade().claimAsOwner(input(firstUserId))).resolves.toMatchObject({
      role: WORKSPACE_ROLE.ADMIN,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    });
    await expect(auditLogsRepo.listByWorkspace(workspace.id, db)).resolves.toEqual([]);
  });
});
