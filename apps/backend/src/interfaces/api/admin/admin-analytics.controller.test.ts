import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsFacade } from "../../../application/authorization/admin-analytics.facade.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { AdminAnalyticsController } from "./admin-analytics.controller.js";

describe("AdminAnalyticsController", () => {
  it("is guarded and forwards a validated range", async () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminAnalyticsController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminAnalyticsController)).toEqual([
      SessionAuthGuard,
      SystemAdminGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, AdminAnalyticsController.prototype.get)).toBe(
      "analytics",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AdminAnalyticsController.prototype.get)).toBe(0);
    const get = vi.fn().mockResolvedValue({ range: "30d" });
    await expect(
      new AdminAnalyticsController({ get } as unknown as AdminAnalyticsFacade).get({
        range: "30d",
      }),
    ).resolves.toEqual({ range: "30d" });
    expect(get).toHaveBeenCalledWith("30d");
  });
});
