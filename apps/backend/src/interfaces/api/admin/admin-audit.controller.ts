import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AdminAuditFacade } from "../../../application/authorization/admin-audit.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { parseAdminAuditQuery } from "./admin-query.js";

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class AdminAuditController {
  constructor(@Inject(AdminAuditFacade) private readonly audit: AdminAuditFacade) {}

  @Get("audit-logs")
  list(@Query() query: unknown) {
    return this.audit.list(parseAdminAuditQuery(query));
  }
}
