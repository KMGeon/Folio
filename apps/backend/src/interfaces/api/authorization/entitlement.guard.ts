import { usersRepo } from "@folio/db";
import type { EntitlementFeature } from "@folio/types";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EntitlementService } from "../../../domain/authorization/entitlement.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";
import { REQUIRE_ENTITLEMENT } from "./require-entitlement.decorator.js";

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<EntitlementFeature>(REQUIRE_ENTITLEMENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Ungated routes stay outside the entitlement axis and must not require an actor load.
    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new CoreException(ErrorType.Unauthorized);
    }

    const actor = await usersRepo.getById(request.user.id);
    if (!actor) {
      throw new CoreException(ErrorType.Unauthorized);
    }

    const decision = await this.entitlements.canUseFeature({
      userId: actor.id,
      globalStatus: actor.globalStatus,
      feature,
    });
    if (!decision.entitled) {
      throw new CoreException(ErrorType.NotEntitled);
    }

    return true;
  }
}
