import { type WorkspaceMemberRow, type WorkspaceRow, usersRepo } from "@folio/db";
import type { WorkspaceRole } from "@folio/types";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { canAccessWorkspace } from "../../../domain/authorization/authorization-policy.js";
import { WorkspaceMembershipService } from "../../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceResolver } from "../../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";
import { REQUIRE_WORKSPACE_ROLE } from "./require-workspace-role.decorator.js";

export interface WorkspaceScopedRequest extends AuthedRequest {
  workspace?: WorkspaceRow;
  workspaceMembership?: WorkspaceMemberRow;
}

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(WorkspaceResolver) private readonly resolver: WorkspaceResolver,
    @Inject(WorkspaceMembershipService)
    private readonly memberships: WorkspaceMembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<WorkspaceRole>(REQUIRE_WORKSPACE_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Missing metadata is a route-configuration error, so authorization must fail closed.
    if (!requiredRole) {
      throw new CoreException(ErrorType.Forbidden);
    }

    const request = context.switchToHttp().getRequest<WorkspaceScopedRequest>();
    const workspaceId =
      typeof request.params?.workspaceId === "string" ? request.params.workspaceId : undefined;
    const actor = request.user;
    if (!workspaceId || !actor) {
      throw new CoreException(ErrorType.Forbidden);
    }

    const workspace = await this.resolver.resolveById(workspaceId);
    if (!workspace) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }

    const actorRow = await usersRepo.getById(actor.id);
    const membership = await this.memberships.getMembership(workspaceId, actor.id);
    if (!actorRow || !membership) {
      throw new CoreException(ErrorType.Forbidden);
    }

    const decision = canAccessWorkspace(
      {
        globalStatus: actorRow.globalStatus,
        isSystemAdmin: actorRow.isSystemAdmin,
      },
      {
        role: membership.role,
        status: membership.status,
      },
      requiredRole,
    );
    if (!decision.allow) {
      throw new CoreException(ErrorType.Forbidden);
    }

    request.workspace = workspace;
    request.workspaceMembership = membership;
    return true;
  }
}
