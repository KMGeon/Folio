import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { DashboardFacade } from "../../../application/dashboard/dashboard.facade.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

@Controller("api/v1/dashboard")
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(
    // Explicit @Inject token because vitest doesn't emit decorator metadata.
    @Inject(DashboardFacade) private readonly dashboard: DashboardFacade,
  ) {}

  /** Live open PRs across the user's installed repos, with DB review status. */
  @Get()
  async get(@CurrentUser() user: AuthedUser) {
    return this.dashboard.getForUser({ id: user.id, login: user.login });
  }
}
