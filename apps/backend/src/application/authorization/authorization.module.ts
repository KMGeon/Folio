import { Module } from "@nestjs/common";
import {
  AlwaysEntitledService,
  EntitlementService,
} from "../../domain/authorization/entitlement.service.js";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { EntitlementGuard } from "../../interfaces/api/authorization/entitlement.guard.js";
import { GlobalStatusGuard } from "../../interfaces/api/authorization/global-status.guard.js";
import { SystemAdminGuard } from "../../interfaces/api/authorization/system-admin.guard.js";
import { WorkspaceRoleGuard } from "../../interfaces/api/authorization/workspace-role.guard.js";
import { AdminAuditController } from "../../interfaces/api/admin/admin-audit.controller.js";
import { AdminAnalyticsController } from "../../interfaces/api/admin/admin-analytics.controller.js";
import { AdminOverviewController } from "../../interfaces/api/admin/admin-overview.controller.js";
import { AdminUsersController } from "../../interfaces/api/admin/admin-users.controller.js";
import { AdminHealthController } from "../../interfaces/api/admin/admin-health.controller.js";
import { AdminJobsController } from "../../interfaces/api/admin/admin-jobs.controller.js";
import { AdminWorkspacesController } from "../../interfaces/api/admin/admin-workspaces.controller.js";
import { WorkspaceMembersController } from "../../interfaces/api/workspaces/workspace-members.controller.js";
import { WorkspaceController } from "../../interfaces/api/workspaces/workspace.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AdminAuditFacade } from "./admin-audit.facade.js";
import { AdminAnalyticsFacade } from "./admin-analytics.facade.js";
import { AdminHealthFacade } from "./admin-health.facade.js";
import { AdminJobsFacade } from "./admin-jobs.facade.js";
import { AdminOverviewFacade } from "./admin-overview.facade.js";
import { AdminUsersFacade } from "./admin-users.facade.js";
import { AdminWorkspacesFacade } from "./admin-workspaces.facade.js";
import { GlobalUsersFacade } from "./global-users.facade.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";

// Feature modules share the same authorization axes while the entitlement
// implementation remains replaceable without changing guard call sites.
@Module({
  imports: [AuthModule],
  providers: [
    WorkspaceResolver,
    WorkspaceMembershipService,
    GlobalUsersFacade,
    AdminUsersFacade,
    AdminAuditFacade,
    AdminAnalyticsFacade,
    AdminOverviewFacade,
    AdminWorkspacesFacade,
    AdminJobsFacade,
    AdminHealthFacade,
    WorkspaceMembersFacade,
    WorkspaceClaimFacade,
    { provide: EntitlementService, useClass: AlwaysEntitledService },
    WorkspaceRoleGuard,
    GlobalStatusGuard,
    SystemAdminGuard,
    EntitlementGuard,
  ],
  controllers: [
    WorkspaceMembersController,
    WorkspaceController,
    AdminUsersController,
    AdminAuditController,
    AdminAnalyticsController,
    AdminOverviewController,
    AdminWorkspacesController,
    AdminJobsController,
    AdminHealthController,
  ],
  exports: [
    WorkspaceResolver,
    WorkspaceMembershipService,
    GlobalUsersFacade,
    AdminUsersFacade,
    AdminAuditFacade,
    AdminAnalyticsFacade,
    AdminOverviewFacade,
    AdminWorkspacesFacade,
    AdminJobsFacade,
    AdminHealthFacade,
    WorkspaceMembersFacade,
    WorkspaceClaimFacade,
    EntitlementService,
    WorkspaceRoleGuard,
    GlobalStatusGuard,
    SystemAdminGuard,
    EntitlementGuard,
  ],
})
export class AuthorizationModule {}
