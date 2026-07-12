import {
  type AdminAuditRow,
  adminAuditRepo,
  adminJobsRepo,
  adminUsersRepo,
  adminWorkspacesRepo,
} from "@folio/db";
import { AUDIT_ACTION } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOverviewFacade } from "./admin-overview.facade.js";

vi.mock("@folio/db", () => ({
  adminAuditRepo: { list: vi.fn() },
  adminUsersRepo: { countPending: vi.fn() },
  adminWorkspacesRepo: { countOverview: vi.fn() },
  adminJobsRepo: { countOverview: vi.fn() },
}));

const emptyQueue = {
  distressedJobs: 0,
  pending: 0,
  running: 0,
  retrying: 0,
  succeededLast24h: 0,
  deadLast24h: 0,
};

function auditRow(): AdminAuditRow {
  return {
    audit: {
      id: "123e4567-e89b-42d3-a456-426614174000",
      actorUserId: "223e4567-e89b-42d3-a456-426614174000",
      action: AUDIT_ACTION.USER_APPROVE,
      targetType: "user",
      targetId: "323e4567-e89b-42d3-a456-426614174000",
      workspaceId: null,
      before: { globalStatus: "pending" },
      after: { globalStatus: "active" },
      createdAt: new Date("2026-07-11T03:04:05.000Z"),
      updatedAt: new Date("2026-07-11T04:00:00.000Z"),
    },
    actorLogin: "admin",
    actorAvatarUrl: "https://avatars.example/admin",
    targetLabel: "octocat",
    workspaceLogin: null,
  };
}

describe("AdminOverviewFacade", () => {
  const facade = new AdminOverviewFacade();

  beforeEach(() => vi.resetAllMocks());

  it("returns no attention item when there are no pending users", async () => {
    vi.mocked(adminUsersRepo.countPending).mockResolvedValue(0);
    vi.mocked(adminAuditRepo.list).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(adminWorkspacesRepo.countOverview).mockResolvedValue({
      workspaces: 0,
      enabledRepositories: 0,
      suspendedInstallations: 0,
    });
    vi.mocked(adminJobsRepo.countOverview).mockResolvedValue(emptyQueue);

    await expect(facade.get()).resolves.toEqual({
      metrics: {
        pendingUsers: 0,
        workspaces: 0,
        enabledRepositories: 0,
        distressedJobs: 0,
      },
      attention: [],
      queueSnapshot: {
        pending: 0,
        running: 0,
        retrying: 0,
        succeededLast24h: 0,
        deadLast24h: 0,
      },
      recentAudit: [],
    });
    expect(adminAuditRepo.list).toHaveBeenCalledWith({ limit: 5 });
  });

  it("returns one pending-users attention item and caps recent audit at five", async () => {
    vi.mocked(adminUsersRepo.countPending).mockResolvedValue(3);
    vi.mocked(adminWorkspacesRepo.countOverview).mockResolvedValue({
      workspaces: 2,
      enabledRepositories: 4,
      suspendedInstallations: 1,
    });
    vi.mocked(adminJobsRepo.countOverview).mockResolvedValue({
      ...emptyQueue,
      distressedJobs: 2,
      pending: 1,
    });
    vi.mocked(adminAuditRepo.list).mockResolvedValue({
      items: Array.from({ length: 6 }, () => auditRow()),
      hasMore: true,
    });

    const result = await facade.get();

    expect(result.attention).toEqual([
      { kind: "pending_users", count: 3 },
      { kind: "suspended_installations", count: 1 },
      { kind: "distressed_jobs", count: 2 },
    ]);
    expect(result.metrics.distressedJobs).toBe(2);
    expect(result.queueSnapshot.pending).toBe(1);
    expect(result.recentAudit).toHaveLength(5);
    expect(result.recentAudit[0]?.createdAt).toBe("2026-07-11T03:04:05.000Z");
  });
});
