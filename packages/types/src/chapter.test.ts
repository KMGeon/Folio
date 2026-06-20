import { describe, expect, it } from "vitest";
import { ChapterEmitSchema, ChapterSchema } from "./chapter.js";
import { DIFF_SIDE } from "./diff.js";

const validEmit = {
  id: "ch1",
  order: 1,
  title: "Intro",
  summary: "Sets up the change",
  hunkRefs: [{ filePath: "a.ts", oldStart: 0 }],
  keyChanges: [
    {
      content: "Is the null check correct?",
      lineRefs: [{ filePath: "a.ts", side: DIFF_SIDE.ADDITIONS, startLine: 1, endLine: 2 }],
    },
  ],
};

describe("ChapterEmitSchema (strict ingestion)", () => {
  it("parses a valid emit chapter", () => {
    expect(ChapterEmitSchema.parse(validEmit)).toBeTruthy();
  });

  it("rejects an unknown key", () => {
    expect(ChapterEmitSchema.safeParse({ ...validEmit, foo: "bar" }).success).toBe(false);
  });

  it("rejects order <= 0", () => {
    expect(ChapterEmitSchema.safeParse({ ...validEmit, order: 0 }).success).toBe(false);
  });

  it("rejects keyChange with empty lineRefs", () => {
    expect(
      ChapterEmitSchema.safeParse({
        ...validEmit,
        keyChanges: [{ content: "x", lineRefs: [] }],
      }).success,
    ).toBe(false);
  });
});

const validWire = {
  id: "ch1",
  externalId: "ext1",
  prId: "pr1",
  revisionId: "rev1",
  order: "0|hzzzzz:",
  title: "Intro",
  summary: "Sets up the change",
  hunkRefs: [{ filePath: "a.ts", oldStart: 0 }],
  keyChanges: [],
  reviewHints: [],
  risks: [{ file: "a.ts", why: "touches auth", severity: "high" }],
  status: "published",
};

describe("ChapterSchema (non-strict wire)", () => {
  it("parses a valid wire chapter", () => {
    expect(ChapterSchema.parse(validWire)).toBeTruthy();
  });

  it("preserves parse on unknown key (non-strict)", () => {
    const res = ChapterSchema.safeParse({ ...validWire, serverOnly: true });
    expect(res.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(ChapterSchema.safeParse({ ...validWire, status: "nope" }).success).toBe(false);
  });
});
