import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AdminHealthFacade } from "../../../application/authorization/admin-health.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class AdminHealthController {
  constructor(@Inject(AdminHealthFacade) private readonly health: AdminHealthFacade) {}

  @Get("health")
  get() {
    return this.health.get();
  }
}
