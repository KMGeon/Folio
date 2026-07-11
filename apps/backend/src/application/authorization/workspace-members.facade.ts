import {
  type Db,
  type WorkspaceMemberRow,
  auditLogsRepo,
  getDb,
  usersRepo,
  workspaceMembersRepo,
} from "@folio/db";
import {
  AUDIT_ACTION,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  type MembershipStatus,
  type WorkspaceRole,
} from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import {
  canManageMember,
  canTransferOwnership,
} from "../../domain/authorization/authorization-policy.js";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export type MemberCommand = {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
};

export type WorkspaceMemberDto = {
  userId: string;
  login: string;
  avatarUrl: string;
  email: string | null;
  role: WorkspaceRole;
  status: MembershipStatus;
};

type LockedPair = {
  actor: WorkspaceMemberRow;
  target: WorkspaceMemberRow;
  transaction: Db;
};

@Injectable()
export class WorkspaceMembersFacade {
  constructor(
    @Inject(WorkspaceMembershipService)
    private readonly membership: WorkspaceMembershipService,
  ) {}

  async list(workspaceId: string): Promise<WorkspaceMemberDto[]> {
    const memberships = await workspaceMembersRepo.listByWorkspace(workspaceId);
    return Promise.all(
      memberships.map(async (membership) => {
        const user = await usersRepo.getById(membership.userId);
        if (!user) {
          throw new CoreException(ErrorType.InternalError);
        }
        // Return only fields needed by the member table; delegation/audit fields stay internal.
        return {
          userId: membership.userId,
          login: user.login,
          avatarUrl: user.avatarUrl,
          email: user.email,
          role: membership.role,
          status: membership.status,
        };
      }),
    );
  }

  suspend(command: MemberCommand): Promise<void> {
    return this.withLockedPair(command, async ({ actor, target, transaction }) => {
      if (
        target.role === WORKSPACE_ROLE.OWNER ||
        !canManageMember(actor, target, "suspend").allow
      ) {
        this.forbid();
      }
      if (target.status === MEMBERSHIP_STATUS.SUSPENDED) {
        return;
      }
      const updated = await this.membership.suspendReviewer(
        this.actionInput(command, target),
        transaction,
      );
      if (!updated) {
        this.conflict();
      }
    });
  }

  restore(command: MemberCommand): Promise<void> {
    return this.withLockedPair(command, async ({ actor, target, transaction }) => {
      if (!canManageMember(actor, target, "restore").allow) {
        this.forbid();
      }
      if (target.status === MEMBERSHIP_STATUS.ACTIVE) {
        return;
      }
      const updated = await this.membership.restoreReviewer(
        this.actionInput(command, target),
        transaction,
      );
      if (!updated) {
        this.conflict();
      }
    });
  }

  remove(command: MemberCommand): Promise<void> {
    return this.withLockedPair(command, async ({ actor, target, transaction }) => {
      if (target.role === WORKSPACE_ROLE.OWNER || !canManageMember(actor, target, "remove").allow) {
        this.forbid();
      }
      if (target.status === MEMBERSHIP_STATUS.SUSPENDED) {
        return;
      }
      const updated = await this.membership.removeReviewer(
        this.actionInput(command, target),
        transaction,
      );
      if (!updated) {
        this.conflict();
      }
    });
  }

  changeRole(command: MemberCommand & { toRole: WorkspaceRole }): Promise<void> {
    return this.withLockedPair(command, async ({ actor, target, transaction }) => {
      // Owner changes have a dedicated atomic path so the workspace never has zero owners.
      if (target.role === WORKSPACE_ROLE.OWNER || command.toRole === WORKSPACE_ROLE.OWNER) {
        this.forbid();
      }
      const operation = command.toRole === WORKSPACE_ROLE.REVIEWER ? "demote" : "elevate";
      if (!canManageMember(actor, target, operation).allow) {
        this.forbid();
      }
      if (target.role === command.toRole) {
        return;
      }
      const updated = await this.membership.changeRole(
        {
          ...this.actionInput(command, target),
          expectedStatus: target.status,
          fromRole: target.role,
          toRole: command.toRole,
        },
        transaction,
      );
      if (!updated) {
        this.conflict();
      }
    });
  }

  async transferOwnership(command: MemberCommand): Promise<void> {
    if (command.actorUserId === command.targetUserId) {
      this.forbid();
    }
    return this.withLockedPair(command, async ({ actor, target, transaction }) => {
      if (!canTransferOwnership(actor).allow || target.status !== MEMBERSHIP_STATUS.ACTIVE) {
        this.forbid();
      }

      const demoted = await workspaceMembersRepo.updateRoleIfCurrent(
        actor.id,
        WORKSPACE_ROLE.OWNER,
        MEMBERSHIP_STATUS.ACTIVE,
        WORKSPACE_ROLE.ADMIN,
        command.actorUserId,
        transaction,
      );
      if (!demoted) {
        this.conflict();
      }

      const promoted = await workspaceMembersRepo.updateRoleIfCurrent(
        target.id,
        target.role,
        MEMBERSHIP_STATUS.ACTIVE,
        WORKSPACE_ROLE.OWNER,
        command.actorUserId,
        transaction,
      );
      if (!promoted) {
        this.conflict();
      }

      await auditLogsRepo.record(
        {
          actorUserId: command.actorUserId,
          action: AUDIT_ACTION.OWNER_TRANSFER,
          targetType: "workspace_member",
          targetId: command.targetUserId,
          workspaceId: command.workspaceId,
          before: { owner: command.actorUserId },
          after: { owner: command.targetUserId },
        },
        transaction,
      );
    });
  }

  private withLockedPair<T>(
    command: MemberCommand,
    operation: (pair: LockedPair) => Promise<T>,
  ): Promise<T> {
    return getDb().transaction(async (transaction) => {
      // Membership is first in membership → user → repository order; later audit FKs may lock users.
      const orderedUserIds = [command.actorUserId, command.targetUserId].sort();
      const rows = await workspaceMembersRepo.getMembershipsForUpdate(
        command.workspaceId,
        orderedUserIds,
        transaction,
      );
      const actor = rows.find((row) => row.userId === command.actorUserId);
      const target = rows.find((row) => row.userId === command.targetUserId);
      if (!actor || !target) {
        this.forbid();
      }
      // Authorization uses the locked current rows, not the controller guard's earlier snapshot.
      return operation({ actor, target, transaction });
    });
  }

  private actionInput(command: MemberCommand, target: WorkspaceMemberRow) {
    return {
      workspaceId: command.workspaceId,
      membershipId: target.id,
      actorUserId: command.actorUserId,
      targetUserId: command.targetUserId,
      expectedRole: target.role,
    };
  }

  private forbid(): never {
    throw new CoreException(ErrorType.Forbidden);
  }

  private conflict(): never {
    throw new CoreException(ErrorType.WorkspaceMembershipConflict);
  }
}
