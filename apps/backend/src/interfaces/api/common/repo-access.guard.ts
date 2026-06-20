import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { RepoAccessService } from "../../../domain/auth/repo-access.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "./session-auth.guard.js";

/**
 * Authorizes a PR-scoped request against the logged-in user's GitHub access to
 * the `:owner/:repo` in the route. Runs after SessionAuthGuard (needs req.user).
 */
@Injectable()
export class RepoAccessGuard implements CanActivate {
  constructor(@Inject(RepoAccessService) private readonly access: RepoAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const owner = typeof request.params?.owner === "string" ? request.params.owner : undefined;
    const repo = typeof request.params?.repo === "string" ? request.params.repo : undefined;
    const user = request.user;
    if (!owner || !repo || !user) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }
    const allowed = await this.access.assertAccessAllowed({
      owner,
      repo,
      username: user.login,
    });
    if (!allowed) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }
    return true;
  }
}
