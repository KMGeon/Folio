import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module.js";
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
import { GlobalUsersController } from "../../interfaces/api/admin/global-users.controller.js";
import { WorkspaceMembersController } from "../../interfaces/api/workspaces/workspace-members.controller.js";
import { WorkspaceController } from "../../interfaces/api/workspaces/workspace.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "./authorization.module.js";
import { GlobalUsersFacade } from "./global-users.facade.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";

const guards = [WorkspaceRoleGuard, GlobalStatusGuard, SystemAdminGuard, EntitlementGuard];
const services = [
  WorkspaceResolver,
  WorkspaceMembershipService,
  GlobalUsersFacade,
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
        WorkspaceMembersFacade,
        WorkspaceClaimFacade,
        { provide: EntitlementService, useClass: AlwaysEntitledService },
        ...guards,
      ]),
    );
    expect(imports).toContain(AuthModule);
    expect(exported).toEqual(expect.arrayContaining([...services, ...guards]));
    expect(controllers).toContain(WorkspaceMembersController);
    expect(controllers).toContain(GlobalUsersController);
    expect(controllers).toContain(WorkspaceController);
  });

  it("boots with a swappable entitlement binding and resolvable guards", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuthorizationModule] }).compile();

    expect(moduleRef.get(EntitlementService)).toBeInstanceOf(AlwaysEntitledService);
    for (const dependency of [
      WorkspaceResolver,
      WorkspaceMembershipService,
      GlobalUsersFacade,
      WorkspaceMembersFacade,
      WorkspaceClaimFacade,
      ...guards,
    ]) {
      expect(moduleRef.get(dependency)).toBeInstanceOf(dependency);
    }
    expect(moduleRef.get(GlobalUsersController)).toBeInstanceOf(GlobalUsersController);
    expect(moduleRef.get(WorkspaceController)).toBeInstanceOf(WorkspaceController);

    await moduleRef.close();
  });

  it("is imported by the application root", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(imports).toContain(AuthorizationModule);
  });
});
