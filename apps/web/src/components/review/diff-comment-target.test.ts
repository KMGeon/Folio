import { describe, expect, it } from "vitest";

import { commentTargetForLine } from "./diff-comment-target";

describe("commentTargetForLine", () => {
  it("targets deletions on LEFT old lines", () => {
    expect(
      commentTargetForLine({
        path: "a.ts",
        n: 4,
        kind: "del",
        text: "old",
        oldLineNumber: 4,
      }),
    ).toEqual({ path: "a.ts", side: "LEFT", line: 4 });
  });

  it("targets additions and context on RIGHT new lines", () => {
    expect(
      commentTargetForLine({
        path: "a.ts",
        n: 5,
        kind: "add",
        text: "new",
        newLineNumber: 5,
      }),
    ).toEqual({ path: "a.ts", side: "RIGHT", line: 5 });

    expect(
      commentTargetForLine({
        path: "a.ts",
        n: 6,
        kind: "ctx",
        text: "same",
        oldLineNumber: 6,
        newLineNumber: 6,
      }),
    ).toEqual({ path: "a.ts", side: "RIGHT", line: 6 });
  });
});
