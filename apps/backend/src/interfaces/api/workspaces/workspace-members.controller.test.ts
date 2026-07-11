import "reflect-metadata";
import { WORKSPACE_ROLE } from "@folio/types";
import { BadRequestException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceMembersFacade } from "../../../application/authorization/workspace-members.facade.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { REQUIRE_WORKSPACE_ROLE } from "../authorization/require-workspace-role.decorator.js";
import { WorkspaceRoleGuard } from "../authorization/workspace-role.guard.js";
import { SessionAuthGuard, type AuthedUser } from "../common/session-auth.guard.js";
import { WorkspaceMembersController } from "./workspace-members.controller.js";

const authedUser: AuthedUser = {
  id: "owner-1",
  login: "owner-login",
  avatarUrl: "https://avatars.example/owner-1",
};

function createController() {
  const facade = {
    list: vi.fn(),
    suspend: vi.fn(),
    restore: vi.fn(),
    remove: vi.fn(),
    changeRole: vi.fn(),
    transferOwnership: vi.fn(),
  };
  return {
    controller: new WorkspaceMembersController(facade as unknown as WorkspaceMembersFacade),
    facade,
  };
}

describe("WorkspaceMembersController", () => {
  it("declares the public base path and guard chain", () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkspaceMembersController)).toBe(
      "api/v1/workspaces/:workspaceId/members",
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, WorkspaceMembersController)).toEqual([
      SessionAuthGuard,
      WorkspaceRoleGuard,
    ]);
  });

  it.each([
    ["list", "/", RequestMethod.GET, WORKSPACE_ROLE.REVIEWER],
    ["suspend", ":userId/suspend", RequestMethod.POST, WORKSPACE_ROLE.ADMIN],
    ["restore", ":userId/restore", RequestMethod.POST, WORKSPACE_ROLE.ADMIN],
    ["remove", ":userId", RequestMethod.DELETE, WORKSPACE_ROLE.ADMIN],
    ["changeRole", ":userId/role", RequestMethod.PATCH, WORKSPACE_ROLE.OWNER],
    ["transfer", "transfer-ownership", RequestMethod.POST, WORKSPACE_ROLE.OWNER],
  ] as const)("declares %s route metadata", (methodName, path, requestMethod, requiredRole) => {
    const handler = WorkspaceMembersController.prototype[methodName];

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
    expect(Reflect.getMetadata(REQUIRE_WORKSPACE_ROLE, handler)).toBe(requiredRole);
  });

  it("lists enriched members in the planned response shape", async () => {
    const { controller, facade } = createController();
    const members = [
      {
        userId: "owner-1",
        login: "owner-login",
        avatarUrl: "https://avatars.example/owner-1",
        email: "owner@example.com",
        role: WORKSPACE_ROLE.OWNER,
        status: "active" as const,
      },
    ];
    facade.list.mockResolvedValue(members);

    await expect(controller.list("workspace-1")).resolves.toEqual({ members });
    expect(facade.list).toHaveBeenCalledWith("workspace-1");
  });

  it.each([
    ["suspend", "suspend"],
    ["restore", "restore"],
    ["remove", "remove"],
  ] as const)("dispatches %s and returns ok", async (controllerMethod, facadeMethod) => {
    const { controller, facade } = createController();

    await expect(
      controller[controllerMethod]("workspace-1", "reviewer-1", authedUser),
    ).resolves.toEqual({ ok: true });
    expect(facade[facadeMethod]).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
      targetUserId: "reviewer-1",
    });
  });

  it("propagates the semantic membership conflict instead of returning ok", async () => {
    const { controller, facade } = createController();
    const conflict = new CoreException(ErrorType.WorkspaceMembershipConflict);
    facade.suspend.mockRejectedValue(conflict);

    await expect(controller.suspend("workspace-1", "reviewer-1", authedUser)).rejects.toBe(
      conflict,
    );
  });

  it("dispatches a valid role change and returns ok", async () => {
    const { controller, facade } = createController();

    await expect(
      controller.changeRole(
        "workspace-1",
        "reviewer-1",
        { role: WORKSPACE_ROLE.ADMIN },
        authedUser,
      ),
    ).resolves.toEqual({ ok: true });
    expect(facade.changeRole).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
      targetUserId: "reviewer-1",
      toRole: WORKSPACE_ROLE.ADMIN,
    });
  });

  it.each([undefined, null, {}, { role: "viewer" }, { role: 1 }])(
    "rejects invalid role body %j with the exact bad request",
    async (body) => {
      const { controller, facade } = createController();

      const error = await controller
        .changeRole("workspace-1", "reviewer-1", body, authedUser)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe("role must be owner, admin, or reviewer");
      expect(facade.changeRole).not.toHaveBeenCalled();
    },
  );

  it("dispatches ownership transfer and returns ok", async () => {
    const { controller, facade } = createController();

    await expect(
      controller.transfer("workspace-1", { userId: "admin-1" }, authedUser),
    ).resolves.toEqual({ ok: true });
    expect(facade.transferOwnership).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
      targetUserId: "admin-1",
    });
  });

  it.each([undefined, null, {}, { userId: "" }, { userId: "   " }, { userId: 1 }])(
    "rejects invalid transfer body %j with the exact bad request",
    async (body) => {
      const { controller, facade } = createController();

      const error = await controller
        .transfer("workspace-1", body, authedUser)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe("userId is required");
      expect(facade.transferOwnership).not.toHaveBeenCalled();
    },
  );
});
