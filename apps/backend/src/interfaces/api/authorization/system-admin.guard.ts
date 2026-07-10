import { usersRepo } from "@folio/db";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";

// System administration is a global service role, independent of workspace authority.
@Injectable()
export class SystemAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new CoreException(ErrorType.Unauthorized);
    }

    const actor = await usersRepo.getById(request.user.id);
    if (!actor?.isSystemAdmin) {
      throw new CoreException(ErrorType.Forbidden);
    }

    return true;
  }
}
