import { usersRepo } from "@folio/db";
import { GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";
import { REQUIRE_GLOBAL_STATUS } from "./require-global-status.decorator.js";

@Injectable()
export class GlobalStatusGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredStatus =
      this.reflector.getAllAndOverride<GlobalStatus>(REQUIRE_GLOBAL_STATUS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? GLOBAL_STATUS.ACTIVE;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new CoreException(ErrorType.Unauthorized);
    }

    const actor = await usersRepo.getById(request.user.id);
    if (!actor || actor.globalStatus !== requiredStatus) {
      throw new CoreException(ErrorType.Forbidden);
    }

    return true;
  }
}
