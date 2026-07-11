import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AdminOverviewFacade } from "../../../application/authorization/admin-overview.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class AdminOverviewController {
  constructor(@Inject(AdminOverviewFacade) private readonly overview: AdminOverviewFacade) {}

  @Get("overview")
  get() {
    return this.overview.get();
  }
}
