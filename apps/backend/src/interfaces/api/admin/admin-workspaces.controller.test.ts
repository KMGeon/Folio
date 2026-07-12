import "reflect-metadata";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { AdminWorkspacesFacade } from "../../../application/authorization/admin-workspaces.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminWorkspacesController } from "./admin-workspaces.controller.js";

describe("AdminWorkspacesController", () => {
  it("protects list and detail routes with both admin guards", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminWorkspacesController)).toBe("api/v1/admin");
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminWorkspacesController)).toEqual([
      SessionAuthGuard,
      SystemAdminGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, AdminWorkspacesController.prototype.list)).toBe(
      "workspaces",
    );
    expect(Reflect.getMetadata(PATH_METADATA, AdminWorkspacesController.prototype.detail)).toBe(
      "workspaces/:workspaceId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AdminWorkspacesController.prototype.list)).toBe(0);
  });

  it("parses list queries before delegating", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new AdminWorkspacesController({ list } as unknown as AdminWorkspacesFacade);
    await controller.list({ q: "  octo  ", installationState: "suspended", limit: "5" });
    expect(list).toHaveBeenCalledWith({ q: "octo", installationState: "suspended", limit: 5 });
  });
});
