import { auditLogsRepo, getDb, usersRepo, workspaceMembersRepo } from "@folio/db";
import {
  AUDIT_ACTION,
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

  async suspend(command: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(command);
    if (target.role === WORKSPACE_ROLE.OWNER || !canManageMember(actor, target, "suspend").allow) {
      this.forbid();
    }
    await this.membership.suspendReviewer(this.actionInput(command, target.id));
  }

  async restore(command: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(command);
    if (!canManageMember(actor, target, "restore").allow) {
      this.forbid();
    }
    await this.membership.restoreReviewer(this.actionInput(command, target.id));
  }

  async remove(command: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(command);
    if (target.role === WORKSPACE_ROLE.OWNER || !canManageMember(actor, target, "remove").allow) {
      this.forbid();
    }
    await this.membership.removeReviewer(this.actionInput(command, target.id));
  }

  async changeRole(command: MemberCommand & { toRole: WorkspaceRole }): Promise<void> {
    const { actor, target } = await this.loadPair(command);
    // Owner changes have a dedicated atomic path so the workspace never has zero owners.
    if (target.role === WORKSPACE_ROLE.OWNER || command.toRole === WORKSPACE_ROLE.OWNER) {
      this.forbid();
    }
    const operation = command.toRole === WORKSPACE_ROLE.REVIEWER ? "demote" : "elevate";
    if (!canManageMember(actor, target, operation).allow) {
      this.forbid();
    }
    await this.membership.changeRole({
      ...this.actionInput(command, target.id),
      fromRole: target.role,
      toRole: command.toRole,
    });
  }

  async transferOwnership(command: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(command);
    if (command.actorUserId === command.targetUserId || !canTransferOwnership(actor).allow) {
      this.forbid();
    }

    await getDb().transaction(async (transaction) => {
      const demoted = await workspaceMembersRepo.updateRoleIfCurrent(
        actor.id,
        WORKSPACE_ROLE.OWNER,
        WORKSPACE_ROLE.ADMIN,
        command.actorUserId,
        transaction,
      );
      if (!demoted) {
        throw new Error("ownership transfer role update returned no row");
      }

      const promoted = await workspaceMembersRepo.updateRoleIfCurrent(
        target.id,
        target.role,
        WORKSPACE_ROLE.OWNER,
        command.actorUserId,
        transaction,
      );
      if (!promoted) {
        throw new Error("ownership transfer role update returned no row");
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

  private async loadPair(command: MemberCommand) {
    const [actor, target] = await Promise.all([
      workspaceMembersRepo.getMembership(command.workspaceId, command.actorUserId),
      workspaceMembersRepo.getMembership(command.workspaceId, command.targetUserId),
    ]);
    if (!actor || !target) {
      this.forbid();
    }
    return { actor, target };
  }

  private actionInput(command: MemberCommand, membershipId: string) {
    return {
      workspaceId: command.workspaceId,
      membershipId,
      actorUserId: command.actorUserId,
      targetUserId: command.targetUserId,
    };
  }

  private forbid(): never {
    throw new CoreException(ErrorType.Forbidden);
  }
}
