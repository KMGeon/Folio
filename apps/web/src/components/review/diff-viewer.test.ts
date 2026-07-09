import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "diff-viewer.tsx"), "utf8");

describe("DiffViewer source", () => {
  it("offers unified and split diff view modes", () => {
    expect(source).toContain('type DiffViewMode = "unified" | "split";');
    expect(source).toContain("Unified");
    expect(source).toContain("Split");
  });

  it("renders split mode from existing ReviewDiffLine values", () => {
    expect(source).toContain("buildSplitDiffRows(chapter.diffLines)");
    expect(source).toContain("commentTargetForLine(activeLine.line)");
  });
});
