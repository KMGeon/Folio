import {
  type Db,
  closeDb,
  getDb,
  runMigrations,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { ACCOUNT_TYPE, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";

const HAS_DB = Boolean(process.env.SUPABASE_DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

d("workspace member mutation concurrency (e2e)", () => {
  let db: Db;
  let facade: WorkspaceMembersFacade;
  let service: WorkspaceMembershipService;
  let workspaceId: string;
  let ownerUserId: string;
  let targetUserId: string;

  beforeEach(async () => {
    db = getDb();
    await runMigrations(db);
    await db.execute("truncate table audit_logs, workspace_members, workspaces, users cascade");
    const workspace = await workspacesRepo.create(
      {
        githubAccountId: 91,
        accountLogin: "concurrency-acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    const owner = await usersRepo.create(
      { githubUserId: 901, login: "owner", avatarUrl: "https://avatars/owner" },
      db,
    );
    const target = await usersRepo.create(
      { githubUserId: 902, login: "target", avatarUrl: "https://avatars/target" },
      db,
    );
    workspaceId = workspace.id;
    ownerUserId = owner.id;
    targetUserId = target.id;
    await workspaceMembersRepo.create(
      {
        workspaceId,
        userId: ownerUserId,
        role: WORKSPACE_ROLE.OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    await workspaceMembersRepo.create(
      {
        workspaceId,
        userId: targetUserId,
        role: WORKSPACE_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      db,
    );
    service = new WorkspaceMembershipService();
    facade = new WorkspaceMembersFacade(service);
  });

  afterAll(async () => {
    await closeDb();
  });

  async function run(operation: "transfer" | "suspend" | "remove"): Promise<void> {
    const command = { workspaceId, actorUserId: ownerUserId, targetUserId };
    if (operation === "transfer") {
      return facade.transferOwnership(command);
    }
    return facade[operation](command);
  }

  async function race(
    first: "transfer" | "suspend" | "remove",
    second: "transfer" | "suspend" | "remove",
  ) {
    const firstLocked = deferred();
    const releaseFirst = deferred();
    const original = workspaceMembersRepo.getMembershipsForUpdate.bind(workspaceMembersRepo);
    let lockCalls = 0;
    const lockSpy = vi
      .spyOn(workspaceMembersRepo, "getMembershipsForUpdate")
      .mockImplementation(async (requestedWorkspaceId, userIds, transaction) => {
        const rows = await original(requestedWorkspaceId, userIds, transaction);
        lockCalls += 1;
        if (lockCalls === 1) {
          firstLocked.resolve();
          await releaseFirst.promise;
        }
        return rows;
      });

    try {
      const firstResult = run(first);
      await firstLocked.promise;
      const secondResult = run(second);
      releaseFirst.resolve();
      return await Promise.allSettled([firstResult, secondResult]);
    } finally {
      releaseFirst.resolve();
      lockSpy.mockRestore();
    }
  }

  async function expectActiveSoleOwner(): Promise<void> {
    const memberships = await workspaceMembersRepo.listByWorkspace(workspaceId, db);
    const owners = memberships.filter((membership) => membership.role === WORKSPACE_ROLE.OWNER);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
  }

  it.each(["suspend", "remove"] as const)(
    "keeps an active sole owner when transfer locks before %s",
    async (operation) => {
      const results = await race("transfer", operation);

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
      await expectActiveSoleOwner();
    },
  );

  it.each(["suspend", "remove"] as const)(
    "keeps an active sole owner when %s locks before transfer",
    async (operation) => {
      const results = await race(operation, "transfer");

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
      await expectActiveSoleOwner();
    },
  );

  it("rolls back a standalone status update when its audit insert fails", async () => {
    const target = await workspaceMembersRepo.getMembership(workspaceId, targetUserId, db);
    expect(target).not.toBeNull();

    await expect(
      service.suspendReviewer({
        workspaceId,
        membershipId: target?.id ?? "missing",
        actorUserId: ownerUserId,
        targetUserId: "not-a-uuid",
        expectedRole: WORKSPACE_ROLE.REVIEWER,
      }),
    ).rejects.toThrow();

    await expect(
      workspaceMembersRepo.getMembership(workspaceId, targetUserId, db),
    ).resolves.toMatchObject({ status: MEMBERSHIP_STATUS.ACTIVE });
  });
});
