import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const diffViewerSource = readFileSync(resolve(__dirname, "diff-viewer.tsx"), "utf8");
const filePanelSource = readFileSync(resolve(__dirname, "review-file-diff-panel.tsx"), "utf8");
const reviewViewSource = readFileSync(resolve(__dirname, "review-view.tsx"), "utf8");

describe("DiffViewer source", () => {
  it("does not duplicate the chapter summary shown in the sidebar", () => {
    expect(diffViewerSource).not.toContain("챕터 개요");
    expect(diffViewerSource).not.toContain('className="mb-3 rounded-lg border bg-card p-3"');
  });

  it("offers unified and split diff view modes", () => {
    expect(reviewViewSource).toContain("<DiffViewModeSwitch");
    expect(reviewViewSource).toContain("viewMode={diffViewMode}");
    expect(filePanelSource).not.toContain("<DiffViewModeSwitch");
  });

  it("renders split mode from existing ReviewDiffLine values", () => {
    expect(filePanelSource).toContain("buildSplitDiffRows(props.lines)");
    expect(diffViewerSource).toContain("commentTargetForLine(activeLine.line)");
  });
});
