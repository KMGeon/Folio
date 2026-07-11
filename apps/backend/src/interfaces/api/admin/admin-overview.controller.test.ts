import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { AdminOverviewFacade } from "../../../application/authorization/admin-overview.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminOverviewController } from "./admin-overview.controller.js";

describe("AdminOverviewController", () => {
  it("declares the guarded admin overview route", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminOverviewController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminOverviewController)).toEqual([
      SessionAuthGuard,
      SystemAdminGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, AdminOverviewController.prototype.get)).toBe(
      "overview",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AdminOverviewController.prototype.get)).toBe(
      RequestMethod.GET,
    );
  });

  it("returns the exact overview facade payload", async () => {
    const payload = {
      metrics: { pendingUsers: 0 },
      attention: [],
      recentAudit: [],
    };
    const facade = { get: vi.fn().mockResolvedValue(payload) };
    const controller = new AdminOverviewController(facade as unknown as AdminOverviewFacade);

    await expect(controller.get()).resolves.toBe(payload);
    expect(facade.get).toHaveBeenCalledOnce();
  });
});
