import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const diffViewerSource = readFileSync(resolve(__dirname, "diff-viewer.tsx"), "utf8");
const diffViewModeSwitchSource = readFileSync(
  resolve(__dirname, "diff-view-mode-switch.tsx"),
  "utf8",
);
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
    expect(diffViewModeSwitchSource).toContain('mode === "unified" ? "통합" : "분할"');
    expect(diffViewModeSwitchSource).not.toContain('"Unified"');
    expect(diffViewModeSwitchSource).not.toContain('"Split"');
  });

  it("keeps the file-read control visually secondary", () => {
    expect(filePanelSource).toContain(
      '"border-muted-foreground/50 bg-muted/50 text-muted-foreground"',
    );
    expect(filePanelSource).not.toContain('"border-primary bg-primary text-primary-foreground"');
  });

  it("renders split mode from existing ReviewDiffLine values", () => {
    expect(filePanelSource).toContain("buildSplitDiffRows(props.lines)");
    expect(diffViewerSource).toContain("commentTargetForLine(activeLine.line)");
  });

  it("accepts a jumpTarget prop for key-change navigation", () => {
    expect(diffViewerSource).toContain("jumpTarget");
    expect(diffViewerSource).toContain("diffLineElementId");
    expect(diffViewerSource).toContain("scrollIntoView");
  });

  it("anchors and highlights jump target rows in the file diff panel", () => {
    const focusStyleSource = readFileSync(resolve(__dirname, "focus-line-styles.ts"), "utf8");
    expect(filePanelSource).toContain("diffLineElementId");
    expect(filePanelSource).toContain("focusRowClass");
    expect(focusStyleSource).toContain("bg-primary/20");
    expect(focusStyleSource).toContain("ring-1 ring-inset ring-primary/50");
    expect(focusStyleSource).toContain("border-warning/70 bg-warning/10");
  });
});
