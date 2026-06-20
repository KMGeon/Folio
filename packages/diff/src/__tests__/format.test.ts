import type { Hunk, PullRequestFile } from "@folio/types";
import { describe, expect, it } from "vitest";
import {
  countHunkLines,
  formatDiffForLlm,
  formatHunkDiff,
  formatHunkDiffWithLineNumbers,
} from "../format.js";
import { MAX_DIFF_CHARS } from "../truncate.js";

const hunk: Hunk = {
  header: "@@ -1,3 +1,4 @@",
  oldStart: 1,
  newStart: 1,
  oldLines: 3,
  newLines: 4,
  lines: [
    { type: "context", content: "a", oldLineNumber: 1, newLineNumber: 1 },
    { type: "deletion", content: "b", oldLineNumber: 2 },
    { type: "addition", content: "b2", newLineNumber: 2 },
    { type: "addition", content: "b3", newLineNumber: 3 },
    { type: "context", content: "c", oldLineNumber: 3, newLineNumber: 4 },
  ],
};

function file(over: Partial<PullRequestFile> = {}): PullRequestFile {
  return {
    path: "src/app.ts",
    filename: "app.ts",
    status: "modified",
    additions: 2,
    deletions: 1,
    hunks: [hunk],
    ...over,
  };
}

describe("formatHunkDiff", () => {
  it("emits plain +/-/space prefixed body", () => {
    expect(formatHunkDiff(hunk)).toBe([" a", "-b", "+b2", "+b3", " c"].join("\n"));
  });
});

describe("formatHunkDiffWithLineNumbers", () => {
  it("emits padded old/new columns; context keeps both, add/del one", () => {
    const out = formatHunkDiffWithLineNumbers(hunk);
    expect(out).toBe(["1 1 | a", "2   |-b", "  2 |+b2", "  3 |+b3", "3 4 | c"].join("\n"));
  });

  it("pads columns to the widest line number", () => {
    const wide: Hunk = {
      header: "@@ -8,3 +8,3 @@",
      oldStart: 8,
      newStart: 8,
      oldLines: 3,
      newLines: 3,
      lines: [
        { type: "context", content: "x", oldLineNumber: 8, newLineNumber: 8 },
        { type: "context", content: "y", oldLineNumber: 9, newLineNumber: 9 },
        { type: "context", content: "z", oldLineNumber: 10, newLineNumber: 10 },
      ],
    };
    const lines = formatHunkDiffWithLineNumbers(wide).split("\n");
    // width 2 because max is 10
    expect(lines[0]).toBe(" 8  8 | x");
    expect(lines[2]).toBe("10 10 | z");
  });
});

describe("countHunkLines", () => {
  it("counts additions and deletions only", () => {
    expect(countHunkLines(hunk)).toEqual({ added: 2, deleted: 1 });
  });
});

describe("formatDiffForLlm", () => {
  it("emits the exact per-hunk header tuple", () => {
    const { text } = formatDiffForLlm([file()]);
    expect(text).toContain(
      '=== File: src/app.ts (modified) | filePath: "src/app.ts", oldStart: 1 ===',
    );
    expect(text).toContain("1 1 | a");
  });

  it("emits a header once per hunk and groups hunks per file", () => {
    const twoHunk = file({
      hunks: [
        { ...hunk, oldStart: 1 },
        { ...hunk, oldStart: 20, newStart: 20 },
      ],
    });
    const { text } = formatDiffForLlm([twoHunk]);
    const headers = text.match(/=== File:/g) ?? [];
    expect(headers).toHaveLength(2);
    expect(text).toContain("oldStart: 1 ===");
    expect(text).toContain("oldStart: 20 ===");
  });

  it("uses oldStart 0 for added files in the tuple", () => {
    const added = file({
      path: "src/new.ts",
      status: "added",
      deletions: 0,
      hunks: [{ ...hunk, oldStart: 0 }],
    });
    const { text } = formatDiffForLlm([added]);
    expect(text).toContain('filePath: "src/new.ts", oldStart: 0 ===');
  });

  it("supports plain (no line number) formatting via opts", () => {
    const { text } = formatDiffForLlm([file()], { withLineNumbers: false });
    expect(text).toContain("-b");
    expect(text).not.toContain("1 1 |");
  });

  it("does not truncate when under the limit", () => {
    const res = formatDiffForLlm([file()]);
    expect(res.truncated).toBe(false);
    expect(res.droppedChars).toBe(0);
    expect(res.text.length).toBeLessThan(MAX_DIFF_CHARS);
  });

  it("truncates at maxChars and reports dropped chars", () => {
    const res = formatDiffForLlm([file()], { maxChars: 10 });
    expect(res.truncated).toBe(true);
    expect(res.text).toHaveLength(10);
    expect(res.droppedChars).toBeGreaterThan(0);
  });
});
