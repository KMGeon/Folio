import { describe, expect, it } from "vitest";
import { isAdminJobDistressed, summarizeAdminJobError } from "./admin-job-error-summary.js";

describe("summarizeAdminJobError", () => {
  it("returns null for empty input", () => {
    expect(summarizeAdminJobError(null)).toBeNull();
    expect(summarizeAdminJobError("   ")).toBeNull();
  });

  it("redacts credentials and caps length", () => {
    const long = `Bearer secret-token ${"x".repeat(300)}`;
    const summary = summarizeAdminJobError(long);
    expect(summary).not.toContain("secret-token");
    expect(summary).toContain("Bearer [redacted]");
    expect(summary?.length).toBeLessThanOrEqual(200);
  });

  it("redacts GitHub personal access tokens", () => {
    expect(summarizeAdminJobError("fail ghp_abcdefghijklmnopqrstuv 1")).toBe("fail [redacted] 1");
  });
});

describe("isAdminJobDistressed", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");

  it("marks dead jobs distressed", () => {
    expect(isAdminJobDistressed("dead", new Date("2026-07-13T00:00:00.000Z"), now)).toBe(true);
  });

  it("marks failed jobs past runAfter distressed", () => {
    expect(isAdminJobDistressed("failed", new Date("2026-07-12T11:00:00.000Z"), now)).toBe(true);
    expect(isAdminJobDistressed("failed", new Date("2026-07-12T13:00:00.000Z"), now)).toBe(false);
  });

  it("does not mark pending or running jobs distressed", () => {
    expect(isAdminJobDistressed("pending", new Date("2026-07-12T11:00:00.000Z"), now)).toBe(false);
    expect(isAdminJobDistressed("running", new Date("2026-07-12T11:00:00.000Z"), now)).toBe(false);
  });
});
