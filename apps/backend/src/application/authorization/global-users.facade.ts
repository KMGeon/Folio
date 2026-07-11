import { type Db, type UserRow, auditLogsRepo, getDb, usersRepo } from "@folio/db";
import { AUDIT_ACTION, GLOBAL_STATUS, type AuditAction, type GlobalStatus } from "@folio/types";
import { Injectable } from "@nestjs/common";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export interface GlobalUserCommand {
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class GlobalUsersFacade {
  list(): Promise<UserRow[]> {
    return usersRepo.listAll();
  }

  approve(command: GlobalUserCommand): Promise<void> {
    return this.transitionGlobalStatus(
      command,
      GLOBAL_STATUS.PENDING,
      GLOBAL_STATUS.ACTIVE,
      AUDIT_ACTION.USER_APPROVE,
    );
  }

  suspend(command: GlobalUserCommand): Promise<void> {
    return this.transitionGlobalStatus(
      command,
      GLOBAL_STATUS.ACTIVE,
      GLOBAL_STATUS.SUSPENDED,
      AUDIT_ACTION.USER_SUSPEND,
      { expectedIsSystemAdmin: false },
    );
  }

  async transferSystemAdmin(command: GlobalUserCommand): Promise<void> {
    if (command.actorUserId === command.targetUserId) {
      this.forbid();
    }

    await getDb().transaction(async (transaction) => {
      const { actor, target } = await this.lockCommandUsers(command, transaction);
      if (!actor || !target) {
        this.userNotFound();
      }
      if (
        actor.globalStatus !== GLOBAL_STATUS.ACTIVE ||
        !actor.isSystemAdmin ||
        target.globalStatus !== GLOBAL_STATUS.ACTIVE ||
        target.isSystemAdmin
      ) {
        this.conflict();
      }

      // CAS predicates keep guard snapshots from authorizing a stale transfer.
      const demoted = await usersRepo.setSystemAdminIfCurrent(
        actor.id,
        true,
        GLOBAL_STATUS.ACTIVE,
        false,
        transaction,
      );
      if (!demoted) {
        this.conflict();
      }
      const promoted = await usersRepo.setSystemAdminIfCurrent(
        target.id,
        false,
        GLOBAL_STATUS.ACTIVE,
        true,
        transaction,
      );
      if (!promoted) {
        this.conflict();
      }

      await auditLogsRepo.record(
        {
          actorUserId: command.actorUserId,
          action: AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER,
          targetType: "user",
          targetId: command.targetUserId,
          workspaceId: null,
          before: { systemAdminUserId: command.actorUserId },
          after: { systemAdminUserId: command.targetUserId },
        },
        transaction,
      );
    });
  }

  private async transitionGlobalStatus(
    command: GlobalUserCommand,
    expectedStatus: GlobalStatus,
    nextStatus: GlobalStatus,
    action: AuditAction,
    conditions?: { expectedIsSystemAdmin: boolean },
  ): Promise<void> {
    await getDb().transaction(async (transaction) => {
      const { actor, target } = await this.lockCommandUsers(command, transaction);
      if (!target) {
        this.userNotFound();
      }
      if (
        !actor ||
        actor.globalStatus !== GLOBAL_STATUS.ACTIVE ||
        !actor.isSystemAdmin ||
        target.globalStatus !== expectedStatus ||
        (nextStatus === GLOBAL_STATUS.SUSPENDED && target.isSystemAdmin)
      ) {
        this.conflict();
      }

      // User-only revocations preserve the workspace → memberships → users → repositories order.
      const updated = conditions
        ? await usersRepo.setGlobalStatusIfCurrent(
            command.targetUserId,
            expectedStatus,
            nextStatus,
            transaction,
            conditions,
          )
        : await usersRepo.setGlobalStatusIfCurrent(
            command.targetUserId,
            expectedStatus,
            nextStatus,
            transaction,
          );
      if (!updated) {
        this.conflict();
      }

      await this.recordGlobalStatusAudit(command, expectedStatus, nextStatus, action, transaction);
    });
  }

  private async lockCommandUsers(
    command: GlobalUserCommand,
    transaction: Db,
  ): Promise<{ actor: UserRow | undefined; target: UserRow | undefined }> {
    // Users are the only lock class here; sorting preserves their place in the global lock order.
    const orderedUserIds = [command.actorUserId, command.targetUserId].sort();
    const lockedUsers = await usersRepo.getByIdsForUpdate(orderedUserIds, transaction);
    return {
      actor: lockedUsers.find((user) => user.id === command.actorUserId),
      target: lockedUsers.find((user) => user.id === command.targetUserId),
    };
  }

  private async recordGlobalStatusAudit(
    command: GlobalUserCommand,
    beforeStatus: GlobalStatus,
    afterStatus: GlobalStatus,
    action: AuditAction,
    transaction: Db,
  ): Promise<void> {
    await auditLogsRepo.record(
      {
        actorUserId: command.actorUserId,
        action,
        targetType: "user",
        targetId: command.targetUserId,
        workspaceId: null,
        before: { globalStatus: beforeStatus },
        after: { globalStatus: afterStatus },
      },
      transaction,
    );
  }

  private userNotFound(): never {
    throw new CoreException(ErrorType.UserNotFound);
  }

  private forbid(): never {
    throw new CoreException(ErrorType.Forbidden);
  }

  private conflict(): never {
    throw new CoreException(ErrorType.GlobalUserConflict);
  }
}
