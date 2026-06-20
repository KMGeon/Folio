import { describe, expect, it } from "vitest";
import { IsoDateTimeSchema, ShaSchema, ShortShaSchema } from "./common.js";

describe("ShaSchema", () => {
  it("accepts a full 40-hex sha", () => {
    const sha = "a".repeat(40);
    expect(ShaSchema.parse(sha)).toBe(sha);
  });

  it("rejects a 39-char sha", () => {
    expect(ShaSchema.safeParse("a".repeat(39)).success).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(ShaSchema.safeParse(`g${"a".repeat(39)}`).success).toBe(false);
  });
});

describe("ShortShaSchema", () => {
  it("accepts a 7-char sha", () => {
    expect(ShortShaSchema.safeParse("abc1234").success).toBe(true);
  });

  it("rejects a 6-char sha", () => {
    expect(ShortShaSchema.safeParse("abc123").success).toBe(false);
  });
});

describe("IsoDateTimeSchema", () => {
  it("accepts an ISO datetime with offset", () => {
    expect(IsoDateTimeSchema.safeParse("2026-06-20T12:00:00.000Z").success).toBe(true);
  });

  it("rejects a date-only string", () => {
    expect(IsoDateTimeSchema.safeParse("2026-06-20").success).toBe(false);
  });
});
