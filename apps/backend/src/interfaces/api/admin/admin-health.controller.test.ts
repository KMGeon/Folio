import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminHealthController } from "./admin-health.controller.js";

describe("AdminHealthController", () => {
  it("is mounted under admin with session + system-admin guards", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminHealthController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminHealthController)).toEqual([
      SessionAuthGuard,
      SystemAdminGuard,
    ]);
  });

  it("delegates to the health facade", async () => {
    const facade = { get: vi.fn().mockResolvedValue({ worker: { status: "unknown" } }) };
    const controller = new AdminHealthController(facade as never);
    await expect(controller.get()).resolves.toEqual({ worker: { status: "unknown" } });
  });
});
