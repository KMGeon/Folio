import { adminJobsRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminJobsFacade, projectAdminJob } from "./admin-jobs.facade.js";
import { encodeAdminPageCursor } from "./admin-page-cursor.js";

vi.mock("@folio/db", () => ({
  adminJobsRepo: {
    list: vi.fn(),
    getById: vi.fn(),
  },
}));

const jobId = "123e4567-e89b-42d3-a456-426614174000";

function summary() {
  return {
    job: {
      id: jobId,
      kind: "review_pull" as const,
      status: "failed" as const,
      payload: {
        kind: "review_pull" as const,
        owner: "acme",
        repo: "app",
        number: 1,
        headSha: "abc",
      },
      result: { secret: true },
      attempts: 2,
      maxAttempts: 5,
      runAfter: new Date("2026-07-12T10:00:00.000Z"),
      leaseExpiresAt: null,
      lockedBy: "worker-1",
      lastError: "Bearer ghp_secret_token boom",
      dedupeKey: "secret-dedupe",
      createdAt: new Date("2026-07-12T09:00:00.000Z"),
      updatedAt: new Date("2026-07-12T11:00:00.000Z"),
    },
    repository: { id: null, fullName: "acme/app" },
    errorSummary: "Bearer [redacted] boom",
    isDistressed: true,
  };
}

describe("AdminJobsFacade", () => {
  const facade = new AdminJobsFacade();

  beforeEach(() => vi.resetAllMocks());

  it("projects allowlisted job fields only", () => {
    const item = projectAdminJob(summary());
    expect(item).toEqual({
      id: jobId,
      kind: "review_pull",
      status: "failed",
      attempts: 2,
      maxAttempts: 5,
      runAfter: "2026-07-12T10:00:00.000Z",
      leaseExpiresAt: null,
      lockedBy: "worker-1",
      repository: { id: null, fullName: "acme/app" },
      errorSummary: "Bearer [redacted] boom",
      isDistressed: true,
      createdAt: "2026-07-12T09:00:00.000Z",
      updatedAt: "2026-07-12T11:00:00.000Z",
    });
    expect(item).not.toHaveProperty("payload");
    expect(item).not.toHaveProperty("result");
    expect(item).not.toHaveProperty("dedupeKey");
    expect(item).not.toHaveProperty("lastError");
  });

  it("encodes next cursor from the last job", async () => {
    vi.mocked(adminJobsRepo.list).mockResolvedValue({
      items: [summary()],
      hasMore: true,
    });

    const page = await facade.list({ limit: 1 });
    expect(page.nextCursor).toBe(
      encodeAdminPageCursor({
        createdAt: new Date("2026-07-12T09:00:00.000Z"),
        id: jobId,
      }),
    );
  });
});
