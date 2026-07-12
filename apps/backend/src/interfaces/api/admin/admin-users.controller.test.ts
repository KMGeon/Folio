import "reflect-metadata";
import { BadRequestException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { AdminUsersFacade } from "../../../application/authorization/admin-users.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard, type AuthedUser } from "../common/session-auth.guard.js";
import { AdminUsersController } from "./admin-users.controller.js";

const authedUser: AuthedUser = {
  id: "admin-1",
  login: "admin-login",
  avatarUrl: "https://avatars.example/admin-1",
  isSystemAdmin: true,
};

function createController() {
  const facade = {
    list: vi.fn(),
    approve: vi.fn(),
    suspend: vi.fn(),
    transferSystemAdmin: vi.fn(),
  };
  return {
    controller: new AdminUsersController(facade as unknown as AdminUsersFacade),
    facade,
  };
}

describe("AdminUsersController", () => {
  it("declares the admin base path and exact guard chain", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminUsersController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminUsersController)).toEqual([
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
    const handler = AdminUsersController.prototype[methodName];

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
  });

  it("parses and dispatches the user query and returns the exact facade page", async () => {
    const { controller, facade } = createController();
    const page = { items: [], nextCursor: null };
    facade.list.mockResolvedValue(page);

    await expect(controller.list({ limit: "10", q: "  octo  " })).resolves.toBe(page);
    expect(facade.list).toHaveBeenCalledWith({ limit: 10, q: "octo", status: "all" });
  });

  it("rejects an invalid list query before facade dispatch", async () => {
    const { controller, facade } = createController();

    expect(() => controller.list({ limit: "101" })).toThrow(BadRequestException);
    expect(facade.list).not.toHaveBeenCalled();
  });

  it.each(["approve", "suspend"] as const)(
    "dispatches %s with the current actor",
    async (operation) => {
      const { controller, facade } = createController();

      await expect(controller[operation](authedUser, "user-1")).resolves.toEqual({ ok: true });
      expect(facade[operation]).toHaveBeenCalledWith({
        actorUserId: "admin-1",
        targetUserId: "user-1",
      });
    },
  );

  it("dispatches transfer with only current actor and validated target", async () => {
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
    "rejects invalid transfer body %j before facade dispatch",
    async (body) => {
      const { controller, facade } = createController();

      await expect(controller.transfer(authedUser, body)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(facade.transferSystemAdmin).not.toHaveBeenCalled();
    },
  );
});
