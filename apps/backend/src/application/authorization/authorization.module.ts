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

// Feature modules share the same authorization axes while the entitlement
// implementation remains replaceable without changing guard call sites.
@Module({
  providers: [
    WorkspaceResolver,
    WorkspaceMembershipService,
    { provide: EntitlementService, useClass: AlwaysEntitledService },
    WorkspaceRoleGuard,
    GlobalStatusGuard,
    SystemAdminGuard,
    EntitlementGuard,
  ],
  exports: [
    WorkspaceResolver,
    WorkspaceMembershipService,
    EntitlementService,
    WorkspaceRoleGuard,
    GlobalStatusGuard,
    SystemAdminGuard,
    EntitlementGuard,
  ],
})
export class AuthorizationModule {}
