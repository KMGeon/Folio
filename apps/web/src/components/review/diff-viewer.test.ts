import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const diffViewerSource = readFileSync(resolve(__dirname, "diff-viewer.tsx"), "utf8");
const filePanelSource = readFileSync(resolve(__dirname, "review-file-diff-panel.tsx"), "utf8");
const reviewViewSource = readFileSync(resolve(__dirname, "review-view.tsx"), "utf8");

describe("DiffViewer source", () => {
  it("uses compact chapter summary spacing", () => {
    expect(diffViewerSource).toContain('className="mb-3 rounded-lg border bg-card p-3"');
    expect(diffViewerSource).toContain("font-serif text-lg");
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
