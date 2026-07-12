import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { AdminJobsFacade } from "../../../application/authorization/admin-jobs.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { parseAdminJobsQuery } from "./admin-query.js";

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class AdminJobsController {
  constructor(@Inject(AdminJobsFacade) private readonly jobs: AdminJobsFacade) {}

  @Get("jobs")
  list(@Query() query: unknown) {
    return this.jobs.list(parseAdminJobsQuery(query));
  }

  @Get("jobs/:jobId")
  detail(@Param("jobId") jobId: string) {
    return this.jobs.detail(jobId);
  }
}
