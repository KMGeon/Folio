import { describe, expect, it } from "vitest";
import { isCommentTargetInChapter } from "./comment-target.js";
import type { ChapterCode } from "./review-read-model.js";

const code: ChapterCode = {
  files: [{ path: "a.ts", additions: 1, deletions: 1 }],
  diffLines: [
    {
      path: "a.ts",
      n: 4,
      kind: "del",
      text: "old",
      oldLineNumber: 4,
    },
    {
      path: "a.ts",
      n: 5,
      kind: "add",
      text: "new",
      newLineNumber: 5,
    },
    {
      path: "a.ts",
      n: 6,
      kind: "ctx",
      text: "same",
      oldLineNumber: 6,
      newLineNumber: 6,
    },
  ],
};

describe("isCommentTargetInChapter", () => {
  it("accepts deletion targets on LEFT old lines", () => {
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "LEFT", line: 4 })).toBe(true);
  });

  it("accepts addition and context targets on RIGHT new lines", () => {
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "RIGHT", line: 5 })).toBe(true);
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "RIGHT", line: 6 })).toBe(true);
  });

  it("rejects mismatched path, side, or line before GitHub writes", () => {
    expect(isCommentTargetInChapter(code, { path: "b.ts", side: "RIGHT", line: 5 })).toBe(false);
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "LEFT", line: 5 })).toBe(false);
    expect(isCommentTargetInChapter(code, { path: "a.ts", side: "RIGHT", line: 4 })).toBe(false);
  });
});
