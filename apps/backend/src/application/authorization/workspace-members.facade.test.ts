import {
  type AuditLogRow,
  type UserRow,
  type WorkspaceMemberRow,
  auditLogsRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
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

const dbDouble = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@folio/db", () => ({
  auditLogsRepo: { record: vi.fn() },
  getDb: () => ({ transaction: dbDouble.transaction }),
  usersRepo: { getById: vi.fn() },
  workspaceMembersRepo: {
    getMembershipsForUpdate: vi.fn(),
    listByWorkspace: vi.fn(),
    updateRoleIfCurrent: vi.fn(),
  },
  workspacesRepo: { getByIdForUpdate: vi.fn() },
}));

const membership = {
  suspendReviewer: vi.fn(),
  restoreReviewer: vi.fn(),
  removeReviewer: vi.fn(),
  changeRole: vi.fn(),
};

const transactionHandle = { kind: "transaction" };
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
    elevatedBy: null,
    suspendedBy: null,
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

function auditRow(input: Parameters<typeof auditLogsRepo.record>[0]): AuditLogRow {
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
  };
}

function lockPair(actor: WorkspaceMemberRow, target: WorkspaceMemberRow): void {
  vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([actor, target]);
}

function expectCoreError(error: unknown, errorType: (typeof ErrorType)[keyof typeof ErrorType]) {
  expect(error).toBeInstanceOf(CoreException);
  expect((error as CoreException).errorType).toBe(errorType);
}

describe("WorkspaceMembersFacade", () => {
  let facade: WorkspaceMembersFacade;

  beforeEach(() => {
    vi.resetAllMocks();
    dbDouble.transaction.mockImplementation(async (callback) => callback(transactionHandle));
    vi.mocked(workspacesRepo.getByIdForUpdate).mockResolvedValue({ id: "workspace-1" } as never);
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
    });

    it("fails closed when a membership identity row is missing", async () => {
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([
        member("missing-1", WORKSPACE_ROLE.REVIEWER),
      ]);
      vi.mocked(usersRepo.getById).mockResolvedValue(null);

      const error = await facade.list("workspace-1").catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.InternalError);
    });
  });

  describe.each([
    ["suspend", "suspendReviewer", MEMBERSHIP_STATUS.ACTIVE],
    ["restore", "restoreReviewer", MEMBERSHIP_STATUS.SUSPENDED],
    ["remove", "removeReviewer", MEMBERSHIP_STATUS.ACTIVE],
  ] as const)("%s", (operation, serviceMethod, targetStatus) => {
    it("locks current rows, authorizes, and passes the transaction through state and audit", async () => {
      const actor = member("admin-1", WORKSPACE_ROLE.ADMIN);
      const target = member("reviewer-1", WORKSPACE_ROLE.REVIEWER, targetStatus);
      const updated = {
        ...target,
        status: operation === "restore" ? MEMBERSHIP_STATUS.ACTIVE : MEMBERSHIP_STATUS.SUSPENDED,
      };
      lockPair(actor, target);
      membership[serviceMethod].mockResolvedValue(updated);

      await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "reviewer-1",
      });

      expect(workspacesRepo.getByIdForUpdate).toHaveBeenCalledWith(
        "workspace-1",
        transactionHandle,
      );
      expect(workspaceMembersRepo.getMembershipsForUpdate).toHaveBeenCalledWith(
        "workspace-1",
        ["admin-1", "reviewer-1"],
        transactionHandle,
      );
      expect(membership[serviceMethod]).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          membershipId: target.id,
          actorUserId: "admin-1",
          targetUserId: "reviewer-1",
          expectedRole: WORKSPACE_ROLE.REVIEWER,
        },
        transactionHandle,
      );
    });

    it("denies a concurrently suspended actor from the locked row", async () => {
      lockPair(
        member("admin-1", WORKSPACE_ROLE.ADMIN, MEMBERSHIP_STATUS.SUSPENDED),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER, targetStatus),
      );

      const error = await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "reviewer-1",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(membership[serviceMethod]).not.toHaveBeenCalled();
    });

    it("denies an admin managing a currently locked admin target", async () => {
      lockPair(
        member("admin-1", WORKSPACE_ROLE.ADMIN),
        member("admin-2", WORKSPACE_ROLE.ADMIN, targetStatus),
      );

      const error = await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "admin-2",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(membership[serviceMethod]).not.toHaveBeenCalled();
    });
  });

  it("sorts actor and target user ids before acquiring row locks", async () => {
    const actor = member("z-admin", WORKSPACE_ROLE.ADMIN);
    const target = member("a-reviewer", WORKSPACE_ROLE.REVIEWER);
    lockPair(actor, target);
    membership.suspendReviewer.mockResolvedValue({
      ...target,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    });

    await facade.suspend({
      workspaceId: "workspace-1",
      actorUserId: "z-admin",
      targetUserId: "a-reviewer",
    });

    expect(workspaceMembersRepo.getMembershipsForUpdate).toHaveBeenCalledWith(
      "workspace-1",
      ["a-reviewer", "z-admin"],
      transactionHandle,
    );
  });

  it("locks the workspace before member rows", async () => {
    const order: string[] = [];
    vi.mocked(workspacesRepo.getByIdForUpdate).mockImplementation(async () => {
      order.push("workspace");
      return { id: "workspace-1" } as never;
    });
    vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockImplementation(async () => {
      order.push("memberships");
      return [
        member("admin-1", WORKSPACE_ROLE.ADMIN),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER),
      ];
    });
    membership.suspendReviewer.mockResolvedValue(
      member("reviewer-1", WORKSPACE_ROLE.REVIEWER, MEMBERSHIP_STATUS.SUSPENDED),
    );

    await facade.suspend({
      workspaceId: "workspace-1",
      actorUserId: "admin-1",
      targetUserId: "reviewer-1",
    });

    expect(order).toEqual(["workspace", "memberships"]);
  });

  it.each(["suspend", "remove"] as const)(
    "keeps %s from disabling the owner",
    async (operation) => {
      lockPair(member("owner-1", WORKSPACE_ROLE.OWNER), member("owner-1", WORKSPACE_ROLE.OWNER));

      const error = await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "owner-1",
        targetUserId: "owner-1",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(
        membership[operation === "suspend" ? "suspendReviewer" : "removeReviewer"],
      ).not.toHaveBeenCalled();
    },
  );

  it("denies a command when a locked membership is missing", async () => {
    vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([
      member("admin-1", WORKSPACE_ROLE.ADMIN),
    ]);

    const error = await facade
      .suspend({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "missing-1",
      })
      .catch((caught: unknown) => caught);

    expectCoreError(error, ErrorType.Forbidden);
    expect(membership.suspendReviewer).not.toHaveBeenCalled();
  });

  it.each([
    ["suspend", "suspendReviewer", MEMBERSHIP_STATUS.SUSPENDED],
    ["restore", "restoreReviewer", MEMBERSHIP_STATUS.ACTIVE],
    ["remove", "removeReviewer", MEMBERSHIP_STATUS.SUSPENDED],
  ] as const)(
    "treats locked desired-state %s as idempotent success",
    async (operation, serviceMethod, status) => {
      lockPair(
        member("admin-1", WORKSPACE_ROLE.ADMIN),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER, status),
      );

      await expect(
        facade[operation]({
          workspaceId: "workspace-1",
          actorUserId: "admin-1",
          targetUserId: "reviewer-1",
        }),
      ).resolves.toBeUndefined();
      expect(membership[serviceMethod]).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["suspend", "suspendReviewer", MEMBERSHIP_STATUS.ACTIVE],
    ["restore", "restoreReviewer", MEMBERSHIP_STATUS.SUSPENDED],
    ["remove", "removeReviewer", MEMBERSHIP_STATUS.ACTIVE],
  ] as const)(
    "reports a null %s mutation as a public conflict",
    async (operation, serviceMethod, status) => {
      lockPair(
        member("admin-1", WORKSPACE_ROLE.ADMIN),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER, status),
      );
      membership[serviceMethod].mockResolvedValue(null);

      const error = await facade[operation]({
        workspaceId: "workspace-1",
        actorUserId: "admin-1",
        targetUserId: "reviewer-1",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.WorkspaceMembershipConflict);
    },
  );

  describe("changeRole", () => {
    it("uses the locked owner authority and passes the same transaction", async () => {
      const target = member("reviewer-1", WORKSPACE_ROLE.REVIEWER);
      lockPair(member("owner-1", WORKSPACE_ROLE.OWNER), target);
      membership.changeRole.mockResolvedValue({ ...target, role: WORKSPACE_ROLE.ADMIN });

      await facade.changeRole({
        workspaceId: "workspace-1",
        actorUserId: "owner-1",
        targetUserId: "reviewer-1",
        toRole: WORKSPACE_ROLE.ADMIN,
      });

      expect(membership.changeRole).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          membershipId: target.id,
          actorUserId: "owner-1",
          targetUserId: "reviewer-1",
          expectedRole: WORKSPACE_ROLE.REVIEWER,
          expectedStatus: MEMBERSHIP_STATUS.ACTIVE,
          fromRole: WORKSPACE_ROLE.REVIEWER,
          toRole: WORKSPACE_ROLE.ADMIN,
        },
        transactionHandle,
      );
    });

    it("denies an owner-only change after the actor is concurrently demoted", async () => {
      lockPair(
        member("owner-1", WORKSPACE_ROLE.ADMIN),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER),
      );

      const error = await facade
        .changeRole({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "reviewer-1",
          toRole: WORKSPACE_ROLE.ADMIN,
        })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(membership.changeRole).not.toHaveBeenCalled();
    });

    it.each([
      [WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.ADMIN],
      [WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.OWNER],
    ] as const)("rejects owner role paths from %s to %s", async (fromRole, toRole) => {
      lockPair(member("owner-1", WORKSPACE_ROLE.OWNER), member("target-1", fromRole));

      const error = await facade
        .changeRole({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "target-1",
          toRole,
        })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(membership.changeRole).not.toHaveBeenCalled();
    });

    it("treats a locked same-role request as idempotent success", async () => {
      lockPair(member("owner-1", WORKSPACE_ROLE.OWNER), member("admin-1", WORKSPACE_ROLE.ADMIN));

      await expect(
        facade.changeRole({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "admin-1",
          toRole: WORKSPACE_ROLE.ADMIN,
        }),
      ).resolves.toBeUndefined();
      expect(membership.changeRole).not.toHaveBeenCalled();
    });

    it("reports a null role mutation as a public conflict", async () => {
      lockPair(
        member("owner-1", WORKSPACE_ROLE.OWNER),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER),
      );
      membership.changeRole.mockResolvedValue(null);

      const error = await facade
        .changeRole({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "reviewer-1",
          toRole: WORKSPACE_ROLE.ADMIN,
        })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.WorkspaceMembershipConflict);
    });
  });

  describe("transferOwnership", () => {
    it("locks current active rows, conditionally updates both, and writes the exact audit", async () => {
      const actor = member("owner-1", WORKSPACE_ROLE.OWNER);
      const target = member("admin-1", WORKSPACE_ROLE.ADMIN);
      const order: string[] = [];
      lockPair(actor, target);
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
        return auditRow(input);
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
        MEMBERSHIP_STATUS.ACTIVE,
        WORKSPACE_ROLE.ADMIN,
        "owner-1",
        transactionHandle,
      );
      expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenNthCalledWith(
        2,
        target.id,
        WORKSPACE_ROLE.ADMIN,
        MEMBERSHIP_STATUS.ACTIVE,
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

    it("rejects an initially suspended transfer target", async () => {
      lockPair(
        member("owner-1", WORKSPACE_ROLE.OWNER),
        member("admin-1", WORKSPACE_ROLE.ADMIN, MEMBERSHIP_STATUS.SUSPENDED),
      );

      const error = await facade
        .transferOwnership({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "admin-1",
        })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
    });

    it("rejects transfer to self before opening a transaction", async () => {
      const error = await facade
        .transferOwnership({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "owner-1",
        })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(dbDouble.transaction).not.toHaveBeenCalled();
    });

    it("denies transfer after the actor is concurrently demoted", async () => {
      lockPair(
        member("owner-1", WORKSPACE_ROLE.ADMIN),
        member("reviewer-1", WORKSPACE_ROLE.REVIEWER),
      );

      const error = await facade
        .transferOwnership({
          workspaceId: "workspace-1",
          actorUserId: "owner-1",
          targetUserId: "reviewer-1",
        })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
    });

    it.each([1, 2] as const)(
      "rolls back and reports conflict when role update %s is stale",
      async (call) => {
        const actor = member("owner-1", WORKSPACE_ROLE.OWNER);
        const target = member("admin-1", WORKSPACE_ROLE.ADMIN);
        const events: string[] = [];
        lockPair(actor, target);
        vi.mocked(workspaceMembersRepo.updateRoleIfCurrent)
          .mockResolvedValueOnce(call === 1 ? null : { ...actor, role: WORKSPACE_ROLE.ADMIN })
          .mockResolvedValueOnce(call === 2 ? null : { ...target, role: WORKSPACE_ROLE.OWNER });
        dbDouble.transaction.mockImplementation(async (callback) => {
          events.push("begin");
          try {
            const result = await callback(transactionHandle);
            events.push("commit");
            return result;
          } catch (error) {
            events.push("rollback");
            throw error;
          }
        });

        const error = await facade
          .transferOwnership({
            workspaceId: "workspace-1",
            actorUserId: "owner-1",
            targetUserId: "admin-1",
          })
          .catch((caught: unknown) => caught);

        expectCoreError(error, ErrorType.WorkspaceMembershipConflict);
        expect(events).toEqual(["begin", "rollback"]);
        expect(auditLogsRepo.record).not.toHaveBeenCalled();
      },
    );
  });
});
