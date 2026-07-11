import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { WorkspaceClaimFacade } from "../../../application/authorization/workspace-claim.facade.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { SessionAuthGuard, type AuthedUser } from "../common/session-auth.guard.js";

@Controller("api/v1/workspaces")
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceClaimFacade) private readonly claimFacade: WorkspaceClaimFacade) {}

  @Get("current")
  current(@CurrentUser() user: AuthedUser) {
    return this.claimFacade.currentContext(user.id);
  }

  @Post("claim")
  claim(@CurrentUser() _user: AuthedUser): never {
    // Sessions do not carry a trusted installer account id yet; accepting body/login identity
    // would let callers claim arbitrary organizations, so the route remains explicitly closed.
    throw new CoreException(ErrorType.WorkspaceNotFound);
  }
}
