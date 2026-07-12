import { describe, expect, it } from "vitest";

import type { ReviewChapter, ReviewDiffLine, ReviewLineRef } from "@/lib/review-api";

import {
  collectFocusLineMarkers,
  diffLineElementId,
  isJumpLine,
  jumpTargetFromKeyChange,
  resolveAllLinesForRef,
  resolveLineRef,
  selectFirstResolvableLineRef,
} from "./resolve-line-ref";

function line(
  partial: Partial<ReviewDiffLine> & Pick<ReviewDiffLine, "path" | "n" | "kind">,
): ReviewDiffLine {
  return {
    text: partial.text ?? "x",
    oldLineNumber: partial.oldLineNumber,
    newLineNumber: partial.newLineNumber,
    ...partial,
  };
}

function chapter(diffLines: ReviewDiffLine[]): ReviewChapter {
  return {
    index: 1,
    title: "t",
    summary: "s",
    files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1, viewed: false }],
    diffLines,
    keyChanges: [],
    viewed: false,
  };
}

describe("resolveLineRef", () => {
  it("matches additions on newLineNumber / n for non-del lines", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "ctx", n: 10, newLineNumber: 10 }),
      line({ path: "a.ts", kind: "add", n: 11, newLineNumber: 11 }),
    ]);
    const ref: ReviewLineRef = {
      filePath: "a.ts",
      side: "additions",
      startLine: 11,
      endLine: 11,
    };
    expect(resolveLineRef(ch, ref)).toMatchObject({ kind: "add", n: 11 });
  });

  it("matches deletions only on del lines via oldLineNumber / n", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "del", n: 5, oldLineNumber: 5 }),
      line({ path: "a.ts", kind: "add", n: 5, newLineNumber: 5 }),
    ]);
    const ref: ReviewLineRef = {
      filePath: "a.ts",
      side: "deletions",
      startLine: 5,
      endLine: 5,
    };
    expect(resolveLineRef(ch, ref)).toMatchObject({ kind: "del", n: 5 });
  });

  it("selects the first in-order match within a range", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "add", n: 3, newLineNumber: 3 }),
      line({ path: "a.ts", kind: "add", n: 4, newLineNumber: 4 }),
    ]);
    const ref: ReviewLineRef = {
      filePath: "a.ts",
      side: "additions",
      startLine: 3,
      endLine: 4,
    };
    expect(resolveLineRef(ch, ref)?.n).toBe(3);
  });

  it("returns null on miss", () => {
    const ch = chapter([line({ path: "a.ts", kind: "add", n: 1, newLineNumber: 1 })]);
    expect(
      resolveLineRef(ch, {
        filePath: "b.ts",
        side: "additions",
        startLine: 1,
        endLine: 1,
      }),
    ).toBeNull();
  });
});

describe("selectFirstResolvableLineRef", () => {
  it("skips a bad first ref and uses a later valid one", () => {
    const ch = chapter([line({ path: "a.ts", kind: "add", n: 9, newLineNumber: 9 })]);
    const result = selectFirstResolvableLineRef(ch, [
      { filePath: "missing.ts", side: "additions", startLine: 1, endLine: 1 },
      { filePath: "a.ts", side: "additions", startLine: 9, endLine: 9 },
    ]);
    expect(result?.line.n).toBe(9);
    expect(result?.ref.filePath).toBe("a.ts");
  });
});

describe("resolveAllLinesForRef", () => {
  it("returns every row in the startLine..endLine range", () => {
    const ch = chapter([
      line({ path: "a.ts", kind: "add", n: 3, newLineNumber: 3 }),
      line({ path: "a.ts", kind: "add", n: 4, newLineNumber: 4 }),
      line({ path: "a.ts", kind: "add", n: 5, newLineNumber: 5 }),
    ]);
    const lines = resolveAllLinesForRef(ch, {
      filePath: "a.ts",
      side: "additions",
      startLine: 3,
      endLine: 5,
    });
    expect(lines.map((entry) => entry.n)).toEqual([3, 4, 5]);
  });
});

describe("jumpTargetFromKeyChange / isJumpLine", () => {
  it("stores the full range but only marks the anchor row as the jump highlight", () => {
    const ch: ReviewChapter = {
      ...chapter([
        line({ path: "a.ts", kind: "add", n: 10, newLineNumber: 10 }),
        line({ path: "a.ts", kind: "add", n: 11, newLineNumber: 11 }),
        line({ path: "a.ts", kind: "add", n: 12, newLineNumber: 12 }),
      ]),
      keyChanges: [
        {
          id: "k1",
          content: "q1",
          lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 10, endLine: 12 }],
          viewed: false,
        },
      ],
    };
    const [keyChange] = ch.keyChanges;
    const [anchorLine, followingLine, lastLine] = ch.diffLines;
    if (!keyChange || !anchorLine || !followingLine || !lastLine) {
      throw new Error("Test fixture must include one key change and three diff lines");
    }

    const target = jumpTargetFromKeyChange(ch, keyChange, 1);
    expect(target).not.toBeNull();
    expect(target?.ranges).toEqual([
      { path: "a.ts", side: "additions", startLine: 10, endLine: 12 },
    ]);
    expect(target?.anchor.lineNumber).toBe(10);
    // Point at the scroll anchor only — full-range wash is unreadable for review.
    expect(isJumpLine(target, anchorLine, 1)).toBe(true);
    expect(isJumpLine(target, followingLine, 1)).toBe(false);
    expect(isJumpLine(target, lastLine, 1)).toBe(false);
  });
});

describe("collectFocusLineMarkers", () => {
  it("collects every row inside each focus range", () => {
    const ch: ReviewChapter = {
      ...chapter([
        line({ path: "a.ts", kind: "add", n: 11, newLineNumber: 11 }),
        line({ path: "a.ts", kind: "add", n: 12, newLineNumber: 12 }),
      ]),
      keyChanges: [
        {
          id: "k1",
          content: "q1",
          lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 11, endLine: 12 }],
          viewed: false,
        },
      ],
    };
    const markers = collectFocusLineMarkers(ch);
    expect(markers).toEqual([
      { path: "a.ts", lineNumber: 11, kind: "add", keyChangeId: "k1" },
      { path: "a.ts", lineNumber: 12, kind: "add", keyChangeId: "k1" },
    ]);
  });
});

describe("diffLineElementId", () => {
  it("encodes chapter, path, kind, and line number", () => {
    const id = diffLineElementId(
      2,
      line({ path: "pkg/a.ts", kind: "add", n: 42, newLineNumber: 42 }),
    );
    expect(id).toContain("diff-line-2-");
    expect(id).toContain("add-42");
    expect(id).not.toContain("/");
  });
});
