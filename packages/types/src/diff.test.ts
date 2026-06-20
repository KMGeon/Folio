import { describe, expect, it } from "vitest";
import { DIFF_SIDE, hunkReferenceSchema, lineRefSchema } from "./diff.js";

describe("hunkReferenceSchema", () => {
  it("accepts oldStart: 0 (new file)", () => {
    expect(hunkReferenceSchema.parse({ filePath: "a.ts", oldStart: 0 })).toEqual({
      filePath: "a.ts",
      oldStart: 0,
    });
  });

  it("rejects negative oldStart", () => {
    expect(hunkReferenceSchema.safeParse({ filePath: "a.ts", oldStart: -1 }).success).toBe(false);
  });

  it("rejects non-integer oldStart", () => {
    expect(hunkReferenceSchema.safeParse({ filePath: "a.ts", oldStart: 1.5 }).success).toBe(false);
  });

  it("rejects empty filePath", () => {
    expect(hunkReferenceSchema.safeParse({ filePath: "", oldStart: 0 }).success).toBe(false);
  });

  it("is strict (rejects unknown keys)", () => {
    expect(hunkReferenceSchema.safeParse({ filePath: "a.ts", oldStart: 0, extra: 1 }).success).toBe(
      false,
    );
  });
});

describe("lineRefSchema", () => {
  it("accepts a valid additions ref", () => {
    const ref = { filePath: "a.ts", side: DIFF_SIDE.ADDITIONS, startLine: 3, endLine: 7 };
    expect(lineRefSchema.parse(ref)).toEqual(ref);
  });

  it("accepts a valid deletions ref", () => {
    const ref = { filePath: "a.ts", side: DIFF_SIDE.DELETIONS, startLine: 1, endLine: 1 };
    expect(lineRefSchema.parse(ref)).toEqual(ref);
  });

  it("rejects startLine > endLine", () => {
    const res = lineRefSchema.safeParse({
      filePath: "a.ts",
      side: DIFF_SIDE.ADDITIONS,
      startLine: 9,
      endLine: 4,
    });
    expect(res.success).toBe(false);
  });

  it("rejects startLine <= 0", () => {
    expect(
      lineRefSchema.safeParse({
        filePath: "a.ts",
        side: DIFF_SIDE.ADDITIONS,
        startLine: 0,
        endLine: 4,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid side", () => {
    expect(
      lineRefSchema.safeParse({
        filePath: "a.ts",
        side: "both",
        startLine: 1,
        endLine: 2,
      }).success,
    ).toBe(false);
  });
});
