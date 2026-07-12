import "reflect-metadata";
import { BadRequestException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { AdminAuditFacade } from "../../../application/authorization/admin-audit.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminAuditController } from "./admin-audit.controller.js";

describe("AdminAuditController", () => {
  it("declares the guarded admin audit route", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminAuditController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminAuditController)).toEqual([
      SessionAuthGuard,
      SystemAdminGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, AdminAuditController.prototype.list)).toBe(
      "audit-logs",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AdminAuditController.prototype.list)).toBe(
      RequestMethod.GET,
    );
  });

  it("parses and dispatches audit filters and returns the exact safe page", async () => {
    const page = { items: [], nextCursor: null };
    const facade = { list: vi.fn().mockResolvedValue(page) };
    const controller = new AdminAuditController(facade as unknown as AdminAuditFacade);

    await expect(controller.list({ limit: "5", from: "2026-07-01T00:00:00Z" })).resolves.toBe(page);
    expect(facade.list).toHaveBeenCalledWith({
      limit: 5,
      from: "2026-07-01T00:00:00Z",
    });
  });

  it("rejects invalid audit filters before facade dispatch", async () => {
    const facade = { list: vi.fn() };
    const controller = new AdminAuditController(facade as unknown as AdminAuditFacade);

    expect(() => controller.list({ from: "yesterday" })).toThrow(BadRequestException);
    expect(facade.list).not.toHaveBeenCalled();
  });
});
