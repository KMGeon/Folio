import { parseUnifiedDiff } from "@folio/diff";
import { describe, expect, it } from "vitest";
import { coverageOf, formatCoverageFeedback, isFullyCovered } from "../coverage.js";
import { allHunkRefs, readFixture } from "./helpers.js";

describe("coverage report", () => {
  const diff = readFixture("multi-dir.diff");
  const files = parseUnifiedDiff(diff);
  const refs = allHunkRefs(files);

  it("reports full coverage for a complete single chapter", () => {
    const report = coverageOf(files, [{ hunkRefs: refs }]);
    expect(isFullyCovered(report)).toBe(true);
    expect(formatCoverageFeedback(report)).toBe("");
  });

  it("detects missing hunks", () => {
    const report = coverageOf(files, [{ hunkRefs: refs.slice(0, -1) }]);
    expect(report.missing.length).toBe(1);
    expect(isFullyCovered(report)).toBe(false);
    const feedback = formatCoverageFeedback(report);
    expect(feedback).toContain("MISSING");
    expect(feedback).toContain(refs.at(-1)!.filePath);
  });

  it("detects extra (invented) hunks", () => {
    const report = coverageOf(files, [
      { hunkRefs: [...refs, { filePath: "ghost.ts", oldStart: 99 }] },
    ]);
    expect(report.extra).toContainEqual({ filePath: "ghost.ts", oldStart: 99 });
    expect(formatCoverageFeedback(report)).toContain("EXTRA");
  });

  it("detects duplicate hunks assigned to two chapters", () => {
    const first = refs[0]!;
    const report = coverageOf(files, [{ hunkRefs: refs }, { hunkRefs: [first] }]);
    expect(report.duplicates).toContainEqual(first);
    expect(formatCoverageFeedback(report)).toContain("DUPLICATE");
  });
});
