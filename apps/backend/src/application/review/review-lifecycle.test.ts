import { describe, expect, it } from "vitest";

import { projectReviewLifecycle } from "./review-lifecycle.js";

const job = (overrides: Record<string, unknown> = {}) =>
  ({
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    result: null,
    updatedAt: new Date("2026-07-11T12:00:00Z"),
    ...overrides,
  }) as never;

describe("projectReviewLifecycle", () => {
  it("projects no job as not requested", () => {
    expect(projectReviewLifecycle(null)).toEqual({
      analysisStatus: "not_requested",
      completedAt: null,
    });
  });

  it.each(["pending", "claimed", "running"])("projects %s as processing", (status) => {
    expect(projectReviewLifecycle(job({ status })).analysisStatus).toBe("processing");
  });

  it("projects a scheduled failure as retrying", () => {
    expect(projectReviewLifecycle(job({ status: "failed", attempts: 2 })).analysisStatus).toBe(
      "retrying",
    );
  });

  it("projects exhausted and comment failures as failed", () => {
    expect(projectReviewLifecycle(job({ status: "dead" })).analysisStatus).toBe("failed");
    expect(
      projectReviewLifecycle(
        job({ status: "succeeded", result: { commentUrl: null, commentError: "denied" } }),
      ).analysisStatus,
    ).toBe("failed");
  });

  it("projects a succeeded comment as complete", () => {
    expect(
      projectReviewLifecycle(
        job({ status: "succeeded", result: { commentUrl: "https://github.test/comment/1" } }),
      ),
    ).toEqual({ analysisStatus: "complete", completedAt: "2026-07-11T12:00:00.000Z" });
  });
});
