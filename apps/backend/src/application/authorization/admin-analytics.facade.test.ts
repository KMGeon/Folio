import { adminAnalyticsRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAnalyticsFacade } from "./admin-analytics.facade.js";

vi.mock("@folio/db", () => ({
  adminAnalyticsRepo: { getProjection: vi.fn() },
}));

describe("AdminAnalyticsFacade", () => {
  const facade = new AdminAnalyticsFacade();

  beforeEach(() => vi.resetAllMocks());

  it("fills every UTC day in the requested range without leaking job details", async () => {
    vi.mocked(adminAnalyticsRepo.getProjection).mockResolvedValue({
      dailyJobs: [{ date: "2026-07-11", succeeded: 3, failed: 1, dead: 0 }],
      dailyUsers: [{ date: "2026-07-12", created: 2 }],
      dailyWorkspaces: [],
      dailyEnabledRepositories: [],
      dailyAudit: [{ date: "2026-07-12", events: 4 }],
      jobStatuses: [{ key: "succeeded", value: 3 }],
      userStatuses: [{ key: "active", value: 2 }],
      installationStates: [{ key: "active", value: 1 }],
      auditActions: [{ key: "user_approve", value: 4 }],
      jobKinds: [{ key: "review_pull", value: 3 }],
    });

    const result = await facade.get("7d", new Date("2026-07-12T12:00:00.000Z"));

    expect(result.days).toHaveLength(7);
    expect(result.days[0]?.date).toBe("2026-07-06");
    expect(result.days[5]?.jobs).toEqual({ succeeded: 3, failed: 1, dead: 0 });
    expect(result.days[6]?.users.created).toBe(2);
    expect(JSON.stringify(result)).not.toContain("payload");
  });
});
