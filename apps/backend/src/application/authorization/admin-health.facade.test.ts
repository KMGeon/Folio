import { adminHealthRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminHealthFacade } from "./admin-health.facade.js";

vi.mock("@folio/db", () => ({
  adminHealthRepo: { getProjection: vi.fn() },
}));

describe("AdminHealthFacade", () => {
  const facade = new AdminHealthFacade();

  beforeEach(() => vi.resetAllMocks());

  it("projects allowlisted health fields only", async () => {
    vi.mocked(adminHealthRepo.getProjection).mockResolvedValue({
      checkedAt: new Date("2026-07-12T12:00:00.000Z"),
      worker: {
        status: "ok",
        staleAfterSeconds: 45,
        workers: [
          {
            workerId: "worker-1",
            lastSeenAt: new Date("2026-07-12T11:59:50.000Z"),
            startedAt: new Date("2026-07-12T10:00:00.000Z"),
            ageSeconds: 10,
            status: "ok",
          },
        ],
      },
      codexPath: {
        status: "recent_success",
        lastReviewPullSucceededAt: new Date("2026-07-12T11:00:00.000Z"),
        reviewPullSucceededLast24h: 2,
        reviewPullFailedLast24h: 0,
        note: "Based on last succeeded review_pull job, not a live Codex probe.",
      },
      queue: { pending: 1, distressedJobs: 0 },
    });

    const payload = await facade.get();
    expect(payload.worker.status).toBe("ok");
    expect(payload.codexPath.lastReviewPullSucceededAt).toBe("2026-07-12T11:00:00.000Z");
    expect(payload).not.toHaveProperty("payload");
    expect(JSON.stringify(payload)).not.toContain("OPENAI");
  });
});
