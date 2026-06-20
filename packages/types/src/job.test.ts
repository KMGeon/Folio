import { describe, expect, it } from "vitest";
import { JOB_KIND, JobPayloadSchema, JobSchema } from "./job.js";

describe("JobPayloadSchema (discriminated union)", () => {
  it("parses a decompose payload", () => {
    const payload = { kind: JOB_KIND.DECOMPOSE, prId: "pr1", revisionId: "rev1" };
    expect(JobPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("parses a re_chapter payload", () => {
    const payload = {
      kind: JOB_KIND.RE_CHAPTER,
      prId: "pr1",
      revisionId: "rev2",
      previousRevisionId: "rev1",
    };
    expect(JobPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("parses a sync_comments payload", () => {
    const payload = { kind: JOB_KIND.SYNC_COMMENTS, prId: "pr1" };
    expect(JobPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a decompose payload missing required fields", () => {
    expect(JobPayloadSchema.safeParse({ kind: JOB_KIND.DECOMPOSE }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(JobPayloadSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });

  it("narrows on the kind discriminant", () => {
    const parsed = JobPayloadSchema.parse({
      kind: JOB_KIND.RE_CHAPTER,
      prId: "pr1",
      revisionId: "rev2",
      previousRevisionId: "rev1",
    });
    if (parsed.kind === JOB_KIND.RE_CHAPTER) {
      expect(parsed.previousRevisionId).toBe("rev1");
    } else {
      throw new Error("expected re_chapter");
    }
  });
});

describe("JobSchema", () => {
  it("parses a full job row", () => {
    const job = {
      id: "job1",
      kind: JOB_KIND.DECOMPOSE,
      status: "pending",
      payload: { kind: JOB_KIND.DECOMPOSE, prId: "pr1", revisionId: "rev1" },
      attempts: 0,
      maxAttempts: 5,
      runAfter: "2026-06-20T12:00:00.000Z",
      claimedAt: null,
      lockedBy: null,
      lastError: null,
      createdAt: "2026-06-20T12:00:00.000Z",
    };
    expect(JobSchema.parse(job)).toBeTruthy();
  });

  it("rejects an invalid status", () => {
    expect(
      JobSchema.safeParse({
        id: "job1",
        kind: JOB_KIND.DECOMPOSE,
        status: "weird",
        payload: { kind: JOB_KIND.DECOMPOSE, prId: "pr1", revisionId: "rev1" },
        attempts: 0,
        maxAttempts: 5,
        runAfter: "2026-06-20T12:00:00.000Z",
        claimedAt: null,
        lockedBy: null,
        lastError: null,
        createdAt: "2026-06-20T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
