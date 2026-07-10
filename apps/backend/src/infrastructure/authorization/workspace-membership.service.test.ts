import {
  type AuditLogRow,
  type Db,
  type WorkspaceMemberRow,
  auditLogsRepo,
  workspaceMembersRepo,
} from "@folio/db";
import { AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMembershipService } from "./workspace-membership.service.js";

const dbDouble = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@folio/db", () => ({
  getDb: () => ({ transaction: dbDouble.transaction }),
  workspaceMembersRepo: {
    getMembership: vi.fn(),
    create: vi.fn(),
    updateStatusIfCurrent: vi.fn(),
    updateRoleIfCurrent: vi.fn(),
  },
  auditLogsRepo: { record: vi.fn() },
}));

const transactionHandle = { kind: "transaction" };
const now = new Date("2026-07-10T00:00:00.000Z");

function memberRow(overrides: Partial<WorkspaceMemberRow> = {}): WorkspaceMemberRow {
  return {
    id: "membership-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    role: WORKSPACE_ROLE.REVIEWER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    elevatedBy: null,
    suspendedBy: null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
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

const actionInput = {
  workspaceId: "workspace-1",
  membershipId: "membership-1",
  actorUserId: "admin-1",
  targetUserId: "user-1",
  expectedRole: WORKSPACE_ROLE.REVIEWER,
} as const;

describe("WorkspaceMembershipService", () => {
  let service: WorkspaceMembershipService;

  beforeEach(() => {
    vi.resetAllMocks();
    dbDouble.transaction.mockImplementation(async (callback) => callback(transactionHandle));
    vi.mocked(auditLogsRepo.record).mockImplementation(async (input) => auditRow(input));
    service = new WorkspaceMembershipService();
  });

  it("returns the requested membership", async () => {
    const membership = memberRow();
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(membership);

    await expect(service.getMembership("workspace-1", "user-1")).resolves.toBe(membership);
    expect(workspaceMembersRepo.getMembership).toHaveBeenCalledWith("workspace-1", "user-1");
  });

  describe("ensureReviewer", () => {
    it("creates a reviewer when no membership exists without auditing", async () => {
      const created = memberRow();
      vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(null);
      vi.mocked(workspaceMembersRepo.create).mockResolvedValue(created);

      await expect(service.ensureReviewer("workspace-1", "user-1")).resolves.toBe(created);

      expect(workspaceMembersRepo.create).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        userId: "user-1",
        role: WORKSPACE_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      });
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it.each([MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.SUSPENDED])(
      "returns an existing %s membership unchanged",
      async (status) => {
        const existing = memberRow({ status });
        vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(existing);

        await expect(service.ensureReviewer("workspace-1", "user-1")).resolves.toBe(existing);
        expect(workspaceMembersRepo.create).not.toHaveBeenCalled();
        expect(auditLogsRepo.record).not.toHaveBeenCalled();
      },
    );
  });

  it("atomically suspends the expected reviewer and records its audit", async () => {
    const updated = memberRow({
      status: MEMBERSHIP_STATUS.SUSPENDED,
      suspendedBy: "admin-1",
    });
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await expect(service.suspendReviewer(actionInput)).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin-1",
      transactionHandle,
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      {
        actorUserId: "admin-1",
        action: AUDIT_ACTION.MEMBER_SUSPEND,
        targetType: "workspace_member",
        targetId: "user-1",
        workspaceId: "workspace-1",
        before: { status: MEMBERSHIP_STATUS.ACTIVE },
        after: { status: MEMBERSHIP_STATUS.SUSPENDED },
      },
      transactionHandle,
    );
  });

  it("atomically restores the expected reviewer and records its audit", async () => {
    const updated = memberRow();
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await expect(service.restoreReviewer(actionInput)).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.SUSPENDED,
      MEMBERSHIP_STATUS.ACTIVE,
      null,
      transactionHandle,
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      {
        actorUserId: "admin-1",
        action: AUDIT_ACTION.MEMBER_RESTORE,
        targetType: "workspace_member",
        targetId: "user-1",
        workspaceId: "workspace-1",
        before: { status: MEMBERSHIP_STATUS.SUSPENDED },
        after: { status: MEMBERSHIP_STATUS.ACTIVE },
      },
      transactionHandle,
    );
  });

  it("uses the persisted suspension path for remove", async () => {
    const updated = memberRow({ status: MEMBERSHIP_STATUS.SUSPENDED });
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await expect(service.removeReviewer(actionInput)).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin-1",
      transactionHandle,
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTION.MEMBER_SUSPEND }),
      transactionHandle,
    );
  });

  it("atomically changes role with expected role and status predicates", async () => {
    const updated = memberRow({ role: WORKSPACE_ROLE.ADMIN, elevatedBy: "owner-1" });
    vi.mocked(workspaceMembersRepo.updateRoleIfCurrent).mockResolvedValue(updated);

    await expect(
      service.changeRole({
        ...actionInput,
        actorUserId: "owner-1",
        expectedStatus: MEMBERSHIP_STATUS.ACTIVE,
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.ADMIN,
      }),
    ).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      WORKSPACE_ROLE.ADMIN,
      "owner-1",
      transactionHandle,
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      {
        actorUserId: "owner-1",
        action: AUDIT_ACTION.ROLE_CHANGE,
        targetType: "workspace_member",
        targetId: "user-1",
        workspaceId: "workspace-1",
        before: { role: WORKSPACE_ROLE.REVIEWER },
        after: { role: WORKSPACE_ROLE.ADMIN },
      },
      transactionHandle,
    );
  });

  it.each(["suspendReviewer", "restoreReviewer", "removeReviewer"] as const)(
    "does not audit a null %s transition",
    async (operation) => {
      vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(null);

      await expect(service[operation](actionInput)).resolves.toBeNull();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    },
  );

  it("does not audit a null role transition", async () => {
    vi.mocked(workspaceMembersRepo.updateRoleIfCurrent).mockResolvedValue(null);

    await expect(
      service.changeRole({
        ...actionInput,
        expectedStatus: MEMBERSHIP_STATUS.ACTIVE,
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.ADMIN,
      }),
    ).resolves.toBeNull();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("uses a supplied transaction without opening a nested transaction", async () => {
    const updated = memberRow({ status: MEMBERSHIP_STATUS.SUSPENDED });
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await service.suspendReviewer(actionInput, transactionHandle as unknown as Db);

    expect(dbDouble.transaction).not.toHaveBeenCalled();
    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      expect.any(String),
      WORKSPACE_ROLE.REVIEWER,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin-1",
      transactionHandle,
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith(expect.any(Object), transactionHandle);
  });

  it("rolls back the standalone state update when audit recording fails", async () => {
    const events: string[] = [];
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(
      memberRow({ status: MEMBERSHIP_STATUS.SUSPENDED }),
    );
    vi.mocked(auditLogsRepo.record).mockRejectedValue(new Error("audit failed"));
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

    await expect(service.suspendReviewer(actionInput)).rejects.toThrow("audit failed");

    expect(events).toEqual(["begin", "rollback"]);
    expect(auditLogsRepo.record).toHaveBeenCalledWith(expect.any(Object), transactionHandle);
  });

  it("returns null for a same-role request without state or audit writes", async () => {
    await expect(
      service.changeRole({
        ...actionInput,
        expectedStatus: MEMBERSHIP_STATUS.ACTIVE,
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.REVIEWER,
      }),
    ).resolves.toBeNull();

    expect(dbDouble.transaction).not.toHaveBeenCalled();
    expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });
});
