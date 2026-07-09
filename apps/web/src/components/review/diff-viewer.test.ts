import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const diffViewerSource = readFileSync(resolve(__dirname, "diff-viewer.tsx"), "utf8");
const filePanelSource = readFileSync(resolve(__dirname, "review-file-diff-panel.tsx"), "utf8");

describe("DiffViewer source", () => {
  it("offers unified and split diff view modes", () => {
    expect(filePanelSource).toContain('type DiffViewMode = "unified" | "split";');
    expect(filePanelSource).toContain("Unified");
    expect(filePanelSource).toContain("Split");
  });

  it("renders split mode from existing ReviewDiffLine values", () => {
    expect(filePanelSource).toContain("buildSplitDiffRows(props.lines)");
    expect(diffViewerSource).toContain("commentTargetForLine(activeLine.line)");
  });
});
