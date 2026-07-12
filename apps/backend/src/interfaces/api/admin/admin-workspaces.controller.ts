import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { AdminWorkspacesFacade } from "../../../application/authorization/admin-workspaces.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { parseAdminWorkspacesQuery } from "./admin-query.js";

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class AdminWorkspacesController {
  constructor(@Inject(AdminWorkspacesFacade) private readonly workspaces: AdminWorkspacesFacade) {}

  @Get("workspaces")
  list(@Query() query: unknown) {
    return this.workspaces.list(parseAdminWorkspacesQuery(query));
  }

  @Get("workspaces/:workspaceId")
  detail(@Param("workspaceId") workspaceId: string) {
    return this.workspaces.detail(workspaceId);
  }
}
