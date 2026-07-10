import {
  type AuditLogRow,
  type UserRow,
  type WorkspaceMemberRow,
  auditLogsRepo,
  usersRepo,
  workspaceMembersRepo,
} from "@folio/db";
import {
  AUDIT_ACTION,
  GLOBAL_STATUS,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  type MembershipStatus,
  type WorkspaceRole,
} from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";

const dbDouble = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@folio/db", () => ({
  auditLogsRepo: { record: vi.fn() },
  getDb: () => ({ transaction: dbDouble.transaction }),
  usersRepo: { getById: vi.fn() },
  workspaceMembersRepo: {
    getMembership: vi.fn(),
    listByWorkspace: vi.fn(),
    updateRoleIfCurrent: vi.fn(),
  },
}));

const membership = {
  suspendReviewer: vi.fn(),
  restoreReviewer: vi.fn(),
  removeReviewer: vi.fn(),
  changeRole: vi.fn(),
};

const now = new Date("2026-07-11T00:00:00.000Z");

function member(
  userId: string,
  role: WorkspaceRole,
  status: MembershipStatus = MEMBERSHIP_STATUS.ACTIVE,
): WorkspaceMemberRow {
  return {
    id: `membership-${userId}`,
    workspaceId: "workspace-1",
    userId,
    role,
    status,
    elevatedBy: "private-elevator",
    suspendedBy: "private-suspender",
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function user(id: string): UserRow {
  return {
    id,
    githubUserId: id === "owner-1" ? 1 : 2,
    login: `${id}-login`,
    avatarUrl: `https://avatars.example/${id}`,
    email: `${id}@example.com`,
    status: "approved",
    globalStatus: GLOBAL_STATUS.ACTIVE,
    isSystemAdmin: false,
    createdAt: now,
    updatedAt: now,
  };
}

function expectForbidden(error: unknown): void {
  expect(error).toBeInstanceOf(CoreException);
  expect((error as CoreException).errorType).toBe(ErrorType.Forbidden);
}

describe("WorkspaceMembersFacade", () => {
  let facade: WorkspaceMembersFacade;

  beforeEach(() => {
    vi.resetAllMocks();
    facade = new WorkspaceMembersFacade(membership as unknown as WorkspaceMembershipService);
  });

  describe("list", () => {
    it("enriches members with UI identity fields and omits audit internals", async () => {
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([
        member("owner-1", WORKSPACE_ROLE.OWNER),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER, MEMBERSHIP_STATUS.SUSPENDED),
      ]);
      vi.mocked(usersRepo.getById).mockImplementation(async (id) => user(id));

      await expect(facade.list("workspace-1")).resolves.toEqual([
        {
          userId: "owner-1",
          login: "owner-1-login",
          avatarUrl: "https://avatars.example/owner-1",
          email: "owner-1@example.com",
          role: WORKSPACE_ROLE.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        {
          userId: "reviewer-1",
          login: "reviewer-1-login",
          avatarUrl: "https://avatars.example/reviewer-1",
          email: "reviewer-1@example.com",
          role: WORKSPACE_ROLE.REVIEWER,
          status: MEMBERSHIP_STATUS.SUSPENDED,
        },
      ]);
      expect(usersRepo.getById).toHaveBeenCalledTimes(2);
      expect(usersRepo.getById).toHaveBeenNthCalledWith(1, "owner-1");
      expect(usersRepo.getById).toHaveBeenNthCalledWith(2, "reviewer-1");
    });

    it("reports an internal error instead of returning a partial row when identity is missing", async () => {
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([
        member("missing-1", WORKSPACE_ROLE.REVIEWER),
      ]);
      vi.mocked(usersRepo.getById).mockResolvedValue(null);

      const error = await facade.list("workspace-1").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CoreException);
      expect((error as CoreException).errorType).toBe(ErrorType.InternalError);
    });
  });

  describe.each([
    ["suspend", "suspendReviewer", MEMBERSHIP_STATUS.ACTIVE],
    ["restore", "restoreReviewer", MEMBERSHIP_STATUS.SUSPENDED],
    ["remove", "removeReviewer", MEMBERSHIP_STATUS.ACTIVE],
  ] as const)("%s", (operation, serviceMethod, targetStatus) => {
    it("lets an admin manage a reviewer", async () => {
      const actor = member("admin-1", WORKSPACE_ROLE.ADMIN);
      const target = member("reviewer-1", WORKSPACE_ROLE.REVIEWER, targetStatus);
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);

      await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "reviewer-1",
      });

      expect(membership[serviceMethod]).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        membershipId: "membership-reviewer-1",
        actorUserId: "admin-1",
        targetUserId: "reviewer-1",
      });
    });

    it("rejects an admin managing another admin with the exact forbidden error", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("admin-1", WORKSPACE_ROLE.ADMIN))
        .mockResolvedValueOnce(member("admin-2", WORKSPACE_ROLE.ADMIN, targetStatus));

      const error = await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "admin-2",
      }).catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(membership[serviceMethod]).not.toHaveBeenCalled();
    });
  });

  it.each(["suspend", "remove"] as const)(
    "rejects %s against the current owner even when the actor is the owner",
    async (operation) => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER))
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER));

      const error = await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "owner-1",
        targetUserId: "owner-1",
      }).catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(membership.suspendReviewer).not.toHaveBeenCalled();
      expect(membership.removeReviewer).not.toHaveBeenCalled();
    },
  );

  it("rejects member actions when either membership is missing", async () => {
    vi.mocked(workspaceMembersRepo.getMembership)
      .mockResolvedValueOnce(member("admin-1", WORKSPACE_ROLE.ADMIN))
      .mockResolvedValueOnce(null);

    const error = await facade
      .suspend({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "missing-1",
      })
      .catch((caught: unknown) => caught);

    expectForbidden(error);
    expect(membership.suspendReviewer).not.toHaveBeenCalled();
  });

  it("rejects member actions from a suspended actor", async () => {
    vi.mocked(workspaceMembersRepo.getMembership)
      .mockResolvedValueOnce(member("admin-1", WORKSPACE_ROLE.ADMIN, MEMBERSHIP_STATUS.SUSPENDED))
      .mockResolvedValueOnce(member("reviewer-1", WORKSPACE_ROLE.REVIEWER));

    const error = await facade
      .remove({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "reviewer-1",
      })
      .catch((caught: unknown) => caught);

    expectForbidden(error);
    expect(membership.removeReviewer).not.toHaveBeenCalled();
  });

  describe("changeRole", () => {
    it("lets the owner elevate a reviewer to admin", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER))
        .mockResolvedValueOnce(member("reviewer-1", WORKSPACE_ROLE.REVIEWER));

      await facade.changeRole({
        workspaceId: "workspace-1",
        actorUserId: "owner-1",
        targetUserId: "reviewer-1",
        toRole: WORKSPACE_ROLE.ADMIN,
      });

      expect(membership.changeRole).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        membershipId: "membership-reviewer-1",
        actorUserId: "owner-1",
        targetUserId: "reviewer-1",
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.ADMIN,
      });
    });

    it("rejects role changes by admins", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("admin-1", WORKSPACE_ROLE.ADMIN))
        .mockResolvedValueOnce(member("reviewer-1", WORKSPACE_ROLE.REVIEWER));

      const error = await facade
        .changeRole({
          workspaceId: "workspace-1",
          actorUserId: "admin-1",
          targetUserId: "reviewer-1",
          toRole: WORKSPACE_ROLE.ADMIN,
        })
        .catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(membership.changeRole).not.toHaveBeenCalled();
    });

    it("rejects changing an existing owner outside ownership transfer", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER))
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER));

      const error = await facade
        .changeRole({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "owner-1",
          toRole: WORKSPACE_ROLE.ADMIN,
        })
        .catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(membership.changeRole).not.toHaveBeenCalled();
    });

    it("rejects assigning owner outside ownership transfer", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER))
        .mockResolvedValueOnce(member("admin-1", WORKSPACE_ROLE.ADMIN));

      const error = await facade
        .changeRole({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "admin-1",
          toRole: WORKSPACE_ROLE.OWNER,
        })
        .catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(membership.changeRole).not.toHaveBeenCalled();
    });
  });

  describe("transferOwnership", () => {
    const transactionHandle = { kind: "transaction" };

    beforeEach(() => {
      dbDouble.transaction.mockImplementation(async (callback) => callback(transactionHandle));
    });

    it("updates both roles and writes the exact audit in one transaction", async () => {
      const actor = member("owner-1", WORKSPACE_ROLE.OWNER);
      const target = member("admin-1", WORKSPACE_ROLE.ADMIN);
      const order: string[] = [];
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);
      vi.mocked(workspaceMembersRepo.updateRoleIfCurrent)
        .mockImplementationOnce(async () => {
          order.push("demote-owner");
          return { ...actor, role: WORKSPACE_ROLE.ADMIN };
        })
        .mockImplementationOnce(async () => {
          order.push("promote-target");
          return { ...target, role: WORKSPACE_ROLE.OWNER };
        });
      vi.mocked(auditLogsRepo.record).mockImplementation(async (input) => {
        order.push("audit");
        return {
          id: "audit-1",
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          workspaceId: input.workspaceId ?? null,
          before: input.before,
          after: input.after,
          createdAt: now,
          updatedAt: now,
        } satisfies AuditLogRow;
      });

      await facade.transferOwnership({
        workspaceId: "workspace-1",
        actorUserId: "owner-1",
        targetUserId: "admin-1",
      });

      expect(order).toEqual(["demote-owner", "promote-target", "audit"]);
      expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenNthCalledWith(
        1,
        actor.id,
        WORKSPACE_ROLE.OWNER,
        WORKSPACE_ROLE.ADMIN,
        "owner-1",
        transactionHandle,
      );
      expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenNthCalledWith(
        2,
        target.id,
        WORKSPACE_ROLE.ADMIN,
        WORKSPACE_ROLE.OWNER,
        "owner-1",
        transactionHandle,
      );
      expect(auditLogsRepo.record).toHaveBeenCalledWith(
        {
          actorUserId: "owner-1",
          action: AUDIT_ACTION.OWNER_TRANSFER,
          targetType: "workspace_member",
          targetId: "admin-1",
          workspaceId: "workspace-1",
          before: { owner: "owner-1" },
          after: { owner: "admin-1" },
        },
        transactionHandle,
      );
    });

    it("rejects transfer to self", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER))
        .mockResolvedValueOnce(member("owner-1", WORKSPACE_ROLE.OWNER));

      const error = await facade
        .transferOwnership({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "owner-1",
        })
        .catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(dbDouble.transaction).not.toHaveBeenCalled();
    });

    it("rejects transfer by a non-owner", async () => {
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(member("admin-1", WORKSPACE_ROLE.ADMIN))
        .mockResolvedValueOnce(member("reviewer-1", WORKSPACE_ROLE.REVIEWER));

      const error = await facade
        .transferOwnership({
          workspaceId: "workspace-1",
          actorUserId: "admin-1",
          targetUserId: "reviewer-1",
        })
        .catch((caught: unknown) => caught);

      expectForbidden(error);
      expect(dbDouble.transaction).not.toHaveBeenCalled();
    });

    it.each([
      ["current owner", 1],
      ["target owner", 2],
    ] as const)("rolls back and omits audit when the %s update is stale", async (_label, call) => {
      const actor = member("owner-1", WORKSPACE_ROLE.OWNER);
      const target = member("admin-1", WORKSPACE_ROLE.ADMIN);
      const transactionEvents: string[] = [];
      vi.mocked(workspaceMembersRepo.getMembership)
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);
      vi.mocked(workspaceMembersRepo.updateRoleIfCurrent)
        .mockResolvedValueOnce(call === 1 ? null : { ...actor, role: WORKSPACE_ROLE.ADMIN })
        .mockResolvedValueOnce(call === 2 ? null : { ...target, role: WORKSPACE_ROLE.OWNER });
      dbDouble.transaction.mockImplementation(async (callback) => {
        transactionEvents.push("begin");
        try {
          const result = await callback(transactionHandle);
          transactionEvents.push("commit");
          return result;
        } catch (error) {
          transactionEvents.push("rollback");
          throw error;
        }
      });

      await expect(
        facade.transferOwnership({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "admin-1",
        }),
      ).rejects.toThrow("ownership transfer role update returned no row");

      expect(transactionEvents).toEqual(["begin", "rollback"]);
      expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenCalledTimes(call);
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });
  });
});
