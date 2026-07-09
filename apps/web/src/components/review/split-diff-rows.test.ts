import { describe, expect, it } from "vitest";

import type { ReviewDiffLine } from "@/lib/review-api";

import { buildSplitDiffRows } from "./split-diff-rows";

const del = (n: number, text: string): ReviewDiffLine => ({
  path: "a.ts",
  n,
  kind: "del",
  text,
  oldLineNumber: n,
});

const add = (n: number, text: string): ReviewDiffLine => ({
  path: "a.ts",
  n,
  kind: "add",
  text,
  newLineNumber: n,
});

const ctx = (n: number, text: string): ReviewDiffLine => ({
  path: "a.ts",
  n,
  kind: "ctx",
  text,
  oldLineNumber: n,
  newLineNumber: n,
});

describe("buildSplitDiffRows", () => {
  it("pairs context lines on both sides", () => {
    const line = ctx(1, "same");

    expect(buildSplitDiffRows([line])).toEqual([{ oldLine: line, newLine: line }]);
  });

  it("pairs adjacent deletion and addition blocks by index", () => {
    const oldA = del(2, "old a");
    const oldB = del(3, "old b");
    const newA = add(2, "new a");

    expect(buildSplitDiffRows([oldA, oldB, newA])).toEqual([
      { oldLine: oldA, newLine: newA },
      { oldLine: oldB, newLine: null },
    ]);
  });

  it("keeps standalone additions on the new side", () => {
    const line = add(4, "new only");

    expect(buildSplitDiffRows([line])).toEqual([{ oldLine: null, newLine: line }]);
  });
});
