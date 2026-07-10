import "reflect-metadata";
import { GLOBAL_STATUS } from "@folio/types";
import { BadRequestException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { GlobalUsersFacade } from "../../../application/authorization/global-users.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard, type AuthedUser } from "../common/session-auth.guard.js";
import { GlobalUsersController } from "./global-users.controller.js";

const authedUser: AuthedUser = {
  id: "admin-1",
  login: "admin-login",
  avatarUrl: "https://avatars.example/admin-1",
};

function createController() {
  const facade = {
    list: vi.fn(),
    approve: vi.fn(),
    suspend: vi.fn(),
    transferSystemAdmin: vi.fn(),
  };
  return {
    controller: new GlobalUsersController(facade as unknown as GlobalUsersFacade),
    facade,
  };
}

describe("GlobalUsersController", () => {
  it("declares the admin base path and guard chain", () => {
    expect(Reflect.getMetadata(PATH_METADATA, GlobalUsersController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, GlobalUsersController)).toEqual([
      SessionAuthGuard,
      SystemAdminGuard,
    ]);
  });

  it.each([
    ["list", "users", RequestMethod.GET],
    ["approve", "users/:id/approve", RequestMethod.POST],
    ["suspend", "users/:id/suspend", RequestMethod.POST],
    ["transfer", "system-admin/transfer", RequestMethod.POST],
  ] as const)("declares %s route metadata", (methodName, path, requestMethod) => {
    const handler = GlobalUsersController.prototype[methodName];

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
  });

  it("maps only the planned global-user response fields", async () => {
    const { controller, facade } = createController();
    const createdAt = new Date("2026-07-11T00:00:00.000Z");
    facade.list.mockResolvedValue([
      {
        id: "user-1",
        githubUserId: 1,
        login: "user-login",
        avatarUrl: "https://avatars.example/user-1",
        email: "user@example.com",
        status: "approved",
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: false,
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    await expect(controller.list()).resolves.toEqual({
      users: [
        {
          id: "user-1",
          login: "user-login",
          avatarUrl: "https://avatars.example/user-1",
          email: "user@example.com",
          globalStatus: GLOBAL_STATUS.ACTIVE,
          isSystemAdmin: false,
          createdAt,
        },
      ],
    });
  });

  it.each(["approve", "suspend"] as const)("dispatches %s and returns ok", async (operation) => {
    const { controller, facade } = createController();

    await expect(controller[operation](authedUser, "user-1")).resolves.toEqual({ ok: true });
    expect(facade[operation]).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      targetUserId: "user-1",
    });
  });

  it("dispatches a valid system-admin transfer and returns ok", async () => {
    const { controller, facade } = createController();

    await expect(controller.transfer(authedUser, { userId: "user-1" })).resolves.toEqual({
      ok: true,
    });
    expect(facade.transferSystemAdmin).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      targetUserId: "user-1",
    });
  });

  it.each([undefined, null, {}, { userId: "" }, { userId: "   " }, { userId: 1 }])(
    "rejects invalid transfer body %j with the exact bad request",
    async (body) => {
      const { controller, facade } = createController();

      const error = await controller.transfer(authedUser, body).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe("userId is required");
      expect(facade.transferSystemAdmin).not.toHaveBeenCalled();
    },
  );
});
