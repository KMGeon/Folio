import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module.js";
import {
  AlwaysEntitledService,
  EntitlementService,
} from "../../domain/authorization/entitlement.service.js";
import { GitHubInstallationIdentityPort } from "../../domain/auth/github-installation-identity.port.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { EntitlementGuard } from "../../interfaces/api/authorization/entitlement.guard.js";
import { GlobalStatusGuard } from "../../interfaces/api/authorization/global-status.guard.js";
import { SystemAdminGuard } from "../../interfaces/api/authorization/system-admin.guard.js";
import { WorkspaceRoleGuard } from "../../interfaces/api/authorization/workspace-role.guard.js";
import { AdminAuditController } from "../../interfaces/api/admin/admin-audit.controller.js";
import { AdminHealthController } from "../../interfaces/api/admin/admin-health.controller.js";
import { AdminJobsController } from "../../interfaces/api/admin/admin-jobs.controller.js";
import { AdminOverviewController } from "../../interfaces/api/admin/admin-overview.controller.js";
import { AdminUsersController } from "../../interfaces/api/admin/admin-users.controller.js";
import { WorkspaceMembersController } from "../../interfaces/api/workspaces/workspace-members.controller.js";
import { WorkspaceController } from "../../interfaces/api/workspaces/workspace.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "./authorization.module.js";
import { AdminAuditFacade } from "./admin-audit.facade.js";
import { AdminHealthFacade } from "./admin-health.facade.js";
import { AdminJobsFacade } from "./admin-jobs.facade.js";
import { AdminOverviewFacade } from "./admin-overview.facade.js";
import { AdminUsersFacade } from "./admin-users.facade.js";
import { GlobalUsersFacade } from "./global-users.facade.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";

const guards = [WorkspaceRoleGuard, GlobalStatusGuard, SystemAdminGuard, EntitlementGuard];
const services = [
  WorkspaceResolver,
  WorkspaceMembershipService,
  GlobalUsersFacade,
  AdminUsersFacade,
  AdminAuditFacade,
  AdminOverviewFacade,
  AdminJobsFacade,
  AdminHealthFacade,
  WorkspaceMembersFacade,
  WorkspaceClaimFacade,
  EntitlementService,
];

describe("AuthorizationModule", () => {
  it("registers and exports the shared authorization stack", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthorizationModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthorizationModule) as (
      | object
      | (new (...args: never[]) => unknown)
    )[];
    const exported = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthorizationModule) as (
      | object
      | (new (...args: never[]) => unknown)
    )[];
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AuthorizationModule,
    ) as (new (...args: never[]) => unknown)[];

    expect(providers).toEqual(
      expect.arrayContaining([
        WorkspaceResolver,
        WorkspaceMembershipService,
        GlobalUsersFacade,
        AdminUsersFacade,
        AdminAuditFacade,
        AdminOverviewFacade,
        AdminJobsFacade,
        AdminHealthFacade,
        WorkspaceMembersFacade,
        WorkspaceClaimFacade,
        { provide: EntitlementService, useClass: AlwaysEntitledService },
        ...guards,
      ]),
    );
    expect(imports).toContain(AuthModule);
    expect(exported).toEqual(expect.arrayContaining([...services, ...guards]));
    expect(controllers).toContain(WorkspaceMembersController);
    expect(controllers).toEqual(
      expect.arrayContaining([
        AdminUsersController,
        AdminAuditController,
        AdminOverviewController,
        AdminJobsController,
        AdminHealthController,
      ]),
    );
    expect(controllers).toContain(WorkspaceController);
  });

  it("boots with a swappable entitlement binding and resolvable guards", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuthorizationModule] }).compile();

    expect(moduleRef.get(EntitlementService)).toBeInstanceOf(AlwaysEntitledService);
    expect(moduleRef.get(GitHubInstallationIdentityPort)).toBe(moduleRef.get(GitHubOAuthAdapter));
    for (const dependency of [
      WorkspaceResolver,
      WorkspaceMembershipService,
      GlobalUsersFacade,
      AdminUsersFacade,
      AdminAuditFacade,
      AdminOverviewFacade,
      AdminJobsFacade,
      AdminHealthFacade,
      WorkspaceMembersFacade,
      WorkspaceClaimFacade,
      ...guards,
    ]) {
      expect(moduleRef.get(dependency)).toBeInstanceOf(dependency);
    }
    expect(moduleRef.get(AdminUsersController)).toBeInstanceOf(AdminUsersController);
    expect(moduleRef.get(AdminAuditController)).toBeInstanceOf(AdminAuditController);
    expect(moduleRef.get(AdminOverviewController)).toBeInstanceOf(AdminOverviewController);
    expect(moduleRef.get(AdminJobsController)).toBeInstanceOf(AdminJobsController);
    expect(moduleRef.get(AdminHealthController)).toBeInstanceOf(AdminHealthController);
    expect(moduleRef.get(WorkspaceController)).toBeInstanceOf(WorkspaceController);

    await moduleRef.close();
  });

  it("is imported by the application root", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(imports).toContain(AuthorizationModule);
  });
});
