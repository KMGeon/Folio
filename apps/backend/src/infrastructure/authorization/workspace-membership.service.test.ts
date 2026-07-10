import { type WorkspaceMemberRow, auditLogsRepo, workspaceMembersRepo } from "@folio/db";
import { AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMembershipService } from "./workspace-membership.service.js";

vi.mock("@folio/db", () => ({
  workspaceMembersRepo: {
    getMembership: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateRole: vi.fn(),
    updateStatusIfCurrent: vi.fn(),
    updateRoleIfCurrent: vi.fn(),
  },
  auditLogsRepo: { record: vi.fn() },
}));

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

const service = new WorkspaceMembershipService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceMembershipService", () => {
  it("returns the requested membership", async () => {
    const membership = memberRow();
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(membership);

    await expect(service.getMembership("workspace-1", "user-1")).resolves.toBe(membership);

    expect(workspaceMembersRepo.getMembership).toHaveBeenCalledWith("workspace-1", "user-1");
  });

  describe("ensureReviewer", () => {
    it("creates a reviewer membership when none exists without auditing", async () => {
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

    it("returns an existing active membership unchanged", async () => {
      const existing = memberRow({ role: WORKSPACE_ROLE.ADMIN });
      vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(existing);

      await expect(service.ensureReviewer("workspace-1", "user-1")).resolves.toBe(existing);

      expect(workspaceMembersRepo.create).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it("returns a suspended membership unchanged and never recreates it", async () => {
      const suspended = memberRow({ status: MEMBERSHIP_STATUS.SUSPENDED });
      vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(suspended);

      await expect(service.ensureReviewer("workspace-1", "user-1")).resolves.toBe(suspended);

      expect(workspaceMembersRepo.create).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });
  });

  it("suspends a reviewer and records the exact audit transition", async () => {
    const updated = memberRow({
      status: MEMBERSHIP_STATUS.SUSPENDED,
      suspendedBy: "admin-1",
    });
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await expect(
      service.suspendReviewer({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }),
    ).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin-1",
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AUDIT_ACTION.MEMBER_SUSPEND,
      targetType: "workspace_member",
      targetId: "user-1",
      workspaceId: "workspace-1",
      before: { status: MEMBERSHIP_STATUS.ACTIVE },
      after: { status: MEMBERSHIP_STATUS.SUSPENDED },
    });
  });

  it("does not audit a stale or missing suspension", async () => {
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(null);

    await expect(
      service.suspendReviewer({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }),
    ).resolves.toBeNull();

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin-1",
    );
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("restores a reviewer and records the exact audit transition", async () => {
    const updated = memberRow();
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await expect(
      service.restoreReviewer({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }),
    ).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      MEMBERSHIP_STATUS.SUSPENDED,
      MEMBERSHIP_STATUS.ACTIVE,
      null,
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AUDIT_ACTION.MEMBER_RESTORE,
      targetType: "workspace_member",
      targetId: "user-1",
      workspaceId: "workspace-1",
      before: { status: MEMBERSHIP_STATUS.SUSPENDED },
      after: { status: MEMBERSHIP_STATUS.ACTIVE },
    });
  });

  it("does not audit a stale or missing restoration", async () => {
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(null);

    await expect(
      service.restoreReviewer({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }),
    ).resolves.toBeNull();

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      MEMBERSHIP_STATUS.SUSPENDED,
      MEMBERSHIP_STATUS.ACTIVE,
      null,
    );
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("removes a reviewer through the persisted suspend path", async () => {
    const updated = memberRow({
      status: MEMBERSHIP_STATUS.SUSPENDED,
      suspendedBy: "admin-1",
    });
    vi.mocked(workspaceMembersRepo.updateStatusIfCurrent).mockResolvedValue(updated);

    await expect(
      service.removeReviewer({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }),
    ).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateStatusIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin-1",
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AUDIT_ACTION.MEMBER_SUSPEND,
      targetType: "workspace_member",
      targetId: "user-1",
      workspaceId: "workspace-1",
      before: { status: MEMBERSHIP_STATUS.ACTIVE },
      after: { status: MEMBERSHIP_STATUS.SUSPENDED },
    });
  });

  it("changes a role and records the exact audit transition", async () => {
    const updated = memberRow({
      role: WORKSPACE_ROLE.ADMIN,
      elevatedBy: "owner-1",
    });
    vi.mocked(workspaceMembersRepo.updateRoleIfCurrent).mockResolvedValue(updated);

    await expect(
      service.changeRole({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "owner-1",
        targetUserId: "user-1",
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.ADMIN,
      }),
    ).resolves.toBe(updated);

    expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      WORKSPACE_ROLE.REVIEWER,
      WORKSPACE_ROLE.ADMIN,
      "owner-1",
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      action: AUDIT_ACTION.ROLE_CHANGE,
      targetType: "workspace_member",
      targetId: "user-1",
      workspaceId: "workspace-1",
      before: { role: WORKSPACE_ROLE.REVIEWER },
      after: { role: WORKSPACE_ROLE.ADMIN },
    });
  });

  it("does not audit a stale or missing role transition", async () => {
    vi.mocked(workspaceMembersRepo.updateRoleIfCurrent).mockResolvedValue(null);

    await expect(
      service.changeRole({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "owner-1",
        targetUserId: "user-1",
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.ADMIN,
      }),
    ).resolves.toBeNull();

    expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenCalledWith(
      "membership-1",
      WORKSPACE_ROLE.REVIEWER,
      WORKSPACE_ROLE.ADMIN,
      "owner-1",
    );
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("rejects a same-role change without mutation or audit", async () => {
    await expect(
      service.changeRole({
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        actorUserId: "owner-1",
        targetUserId: "user-1",
        fromRole: WORKSPACE_ROLE.REVIEWER,
        toRole: WORKSPACE_ROLE.REVIEWER,
      }),
    ).resolves.toBeNull();

    expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
    expect(workspaceMembersRepo.updateRole).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });
});
