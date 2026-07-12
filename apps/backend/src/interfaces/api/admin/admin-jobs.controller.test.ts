import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { AdminJobsController } from "./admin-jobs.controller.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";

describe("AdminJobsController", () => {
  it("is mounted under admin with session + system-admin guards", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminJobsController)).toBe("api/v1/admin");
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminJobsController) as unknown[];
    expect(guards).toEqual([SessionAuthGuard, SystemAdminGuard]);
  });

  it("delegates list and detail to the facade", async () => {
    const facade = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      detail: vi.fn().mockResolvedValue({ id: "job-1" }),
    };
    const controller = new AdminJobsController(facade as never);

    await expect(controller.list({ limit: "10" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(facade.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));

    await expect(controller.detail("job-1")).resolves.toEqual({ id: "job-1" });
    expect(facade.detail).toHaveBeenCalledWith("job-1");
  });
});
