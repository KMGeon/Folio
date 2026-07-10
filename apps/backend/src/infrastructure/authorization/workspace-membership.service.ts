import { type WorkspaceMemberRow, auditLogsRepo, workspaceMembersRepo } from "@folio/db";
import { AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE, type WorkspaceRole } from "@folio/types";
import { Injectable } from "@nestjs/common";

export interface MemberActionInput {
  workspaceId: string;
  membershipId: string;
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class WorkspaceMembershipService {
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberRow | null> {
    return workspaceMembersRepo.getMembership(workspaceId, userId);
  }

  async ensureReviewer(workspaceId: string, userId: string): Promise<WorkspaceMemberRow> {
    const existing = await workspaceMembersRepo.getMembership(workspaceId, userId);
    // Suspended rows remain authoritative so GitHub access cannot auto-create around removal.
    if (existing) {
      return existing;
    }
    return workspaceMembersRepo.create({
      workspaceId,
      userId,
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });
  }

  async suspendReviewer(input: MemberActionInput): Promise<WorkspaceMemberRow | null> {
    const row = await workspaceMembersRepo.updateStatus(
      input.membershipId,
      MEMBERSHIP_STATUS.SUSPENDED,
      input.actorUserId,
    );
    await auditLogsRepo.record({
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.MEMBER_SUSPEND,
      targetType: "workspace_member",
      targetId: input.targetUserId,
      workspaceId: input.workspaceId,
      before: { status: MEMBERSHIP_STATUS.ACTIVE },
      after: { status: MEMBERSHIP_STATUS.SUSPENDED },
    });
    return row;
  }

  async restoreReviewer(input: MemberActionInput): Promise<WorkspaceMemberRow | null> {
    const row = await workspaceMembersRepo.updateStatus(
      input.membershipId,
      MEMBERSHIP_STATUS.ACTIVE,
      null,
    );
    await auditLogsRepo.record({
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.MEMBER_RESTORE,
      targetType: "workspace_member",
      targetId: input.targetUserId,
      workspaceId: input.workspaceId,
      before: { status: MEMBERSHIP_STATUS.SUSPENDED },
      after: { status: MEMBERSHIP_STATUS.ACTIVE },
    });
    return row;
  }

  // Removal persists as suspension so later GitHub access cannot recreate the member.
  removeReviewer(input: MemberActionInput): Promise<WorkspaceMemberRow | null> {
    return this.suspendReviewer(input);
  }

  async changeRole(
    input: MemberActionInput & { fromRole: WorkspaceRole; toRole: WorkspaceRole },
  ): Promise<WorkspaceMemberRow | null> {
    const row = await workspaceMembersRepo.updateRole(
      input.membershipId,
      input.toRole,
      input.actorUserId,
    );
    await auditLogsRepo.record({
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.ROLE_CHANGE,
      targetType: "workspace_member",
      targetId: input.targetUserId,
      workspaceId: input.workspaceId,
      before: { role: input.fromRole },
      after: { role: input.toRole },
    });
    return row;
  }
}
