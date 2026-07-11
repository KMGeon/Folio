import {
  type Db,
  type WorkspaceMemberRow,
  auditLogsRepo,
  getDb,
  workspaceMembersRepo,
} from "@folio/db";
import {
  AUDIT_ACTION,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  type MembershipStatus,
  type WorkspaceRole,
} from "@folio/types";
import { Injectable } from "@nestjs/common";

export type MemberActionInput = {
  workspaceId: string;
  membershipId: string;
  actorUserId: string;
  targetUserId: string;
  expectedRole: WorkspaceRole;
};

@Injectable()
export class WorkspaceMembershipService {
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberRow | null> {
    return workspaceMembersRepo.getMembership(workspaceId, userId);
  }

  async ensureReviewer(workspaceId: string, userId: string, db?: Db): Promise<WorkspaceMemberRow> {
    const existing = db
      ? await workspaceMembersRepo.getMembership(workspaceId, userId, db)
      : await workspaceMembersRepo.getMembership(workspaceId, userId);
    // Suspended rows remain authoritative so GitHub access cannot auto-create around removal.
    if (existing) {
      return existing;
    }
    const input = {
      workspaceId,
      userId,
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    };
    return db ? workspaceMembersRepo.create(input, db) : workspaceMembersRepo.create(input);
  }

  suspendReviewer(input: MemberActionInput, db?: Db): Promise<WorkspaceMemberRow | null> {
    return this.updateStatusAndAudit(
      input,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
      input.actorUserId,
      AUDIT_ACTION.MEMBER_SUSPEND,
      db,
    );
  }

  restoreReviewer(input: MemberActionInput, db?: Db): Promise<WorkspaceMemberRow | null> {
    return this.updateStatusAndAudit(
      input,
      MEMBERSHIP_STATUS.SUSPENDED,
      MEMBERSHIP_STATUS.ACTIVE,
      null,
      AUDIT_ACTION.MEMBER_RESTORE,
      db,
    );
  }

  // Removal persists as suspension so later GitHub access cannot recreate the member.
  removeReviewer(input: MemberActionInput, db?: Db): Promise<WorkspaceMemberRow | null> {
    return this.suspendReviewer(input, db);
  }

  async changeRole(
    input: MemberActionInput & {
      expectedStatus: MembershipStatus;
      fromRole: WorkspaceRole;
      toRole: WorkspaceRole;
    },
    db?: Db,
  ): Promise<WorkspaceMemberRow | null> {
    if (input.fromRole === input.toRole) {
      return null;
    }
    return this.inTransaction(db, async (transaction) => {
      const row = await workspaceMembersRepo.updateRoleIfCurrent(
        input.membershipId,
        input.fromRole,
        input.expectedStatus,
        input.toRole,
        input.actorUserId,
        transaction,
      );
      if (!row) {
        return null;
      }
      await auditLogsRepo.record(
        {
          actorUserId: input.actorUserId,
          action: AUDIT_ACTION.ROLE_CHANGE,
          targetType: "workspace_member",
          targetId: input.targetUserId,
          workspaceId: input.workspaceId,
          before: { role: input.fromRole },
          after: { role: input.toRole },
        },
        transaction,
      );
      return row;
    });
  }

  private updateStatusAndAudit(
    input: MemberActionInput,
    fromStatus: MembershipStatus,
    toStatus: MembershipStatus,
    suspendedBy: string | null,
    action: typeof AUDIT_ACTION.MEMBER_SUSPEND | typeof AUDIT_ACTION.MEMBER_RESTORE,
    db?: Db,
  ): Promise<WorkspaceMemberRow | null> {
    return this.inTransaction(db, async (transaction) => {
      const row = await workspaceMembersRepo.updateStatusIfCurrent(
        input.membershipId,
        input.expectedRole,
        fromStatus,
        toStatus,
        suspendedBy,
        transaction,
      );
      if (!row) {
        return null;
      }
      await auditLogsRepo.record(
        {
          actorUserId: input.actorUserId,
          action,
          targetType: "workspace_member",
          targetId: input.targetUserId,
          workspaceId: input.workspaceId,
          before: { status: fromStatus },
          after: { status: toStatus },
        },
        transaction,
      );
      return row;
    });
  }

  private inTransaction<T>(db: Db | undefined, operation: (transaction: Db) => Promise<T>) {
    if (db) {
      return operation(db);
    }
    // State and its audit are one durable authorization event, even for standalone callers.
    return getDb().transaction(operation);
  }
}
