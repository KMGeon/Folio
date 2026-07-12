import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AdminAnalyticsFacade } from "../../../application/authorization/admin-analytics.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { parseAdminAnalyticsQuery } from "./admin-query.js";

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class AdminAnalyticsController {
  constructor(@Inject(AdminAnalyticsFacade) private readonly analytics: AdminAnalyticsFacade) {}

  @Get("analytics")
  get(@Query() query: unknown) {
    return this.analytics.get(parseAdminAnalyticsQuery(query).range);
  }
}
