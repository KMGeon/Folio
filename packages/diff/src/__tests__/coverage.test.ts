import type { HunkReference, PullRequestFile } from "@folio/types";
import { describe, expect, it } from "vitest";
import {
  HunkCoverageError,
  computeCoverage,
  findUnassignedHunks,
  validateHunkCoverage,
} from "../coverage.js";
import { buildOtherChangesChapter } from "../other-changes.js";

function fileWith(p: string, oldStarts: number[]): PullRequestFile {
  return {
    path: p,
    filename: p.split("/").at(-1) ?? p,
    status: "modified",
    additions: 1,
    deletions: 0,
    hunks: oldStarts.map((oldStart) => ({
      header: `@@ -${oldStart} +${oldStart} @@`,
      oldStart,
      newStart: oldStart,
      oldLines: 1,
      newLines: 1,
      lines: [{ type: "addition" as const, content: "x", newLineNumber: oldStart }],
    })),
  };
}

const files: PullRequestFile[] = [fileWith("src/a.ts", [1, 10]), fileWith("src/b.ts", [5])];

function chapter(...refs: HunkReference[]) {
  return { hunkRefs: refs };
}

describe("validateHunkCoverage", () => {
  it("passes when every hunk is assigned exactly once", () => {
    expect(() =>
      validateHunkCoverage(files, [
        chapter({ filePath: "src/a.ts", oldStart: 1 }, { filePath: "src/b.ts", oldStart: 5 }),
        chapter({ filePath: "src/a.ts", oldStart: 10 }),
      ]),
    ).not.toThrow();
  });

  it("throws with a missing hunk", () => {
    try {
      validateHunkCoverage(files, [chapter({ filePath: "src/a.ts", oldStart: 1 })]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(HunkCoverageError);
      const err = e as HunkCoverageError;
      expect(err.missing).toEqual([
        { filePath: "src/a.ts", oldStart: 10 },
        { filePath: "src/b.ts", oldStart: 5 },
      ]);
      expect(err.extra).toEqual([]);
      expect(err.duplicates).toEqual([]);
      expect(err.message).toContain("Missing hunks (2)");
      expect(err.message).toContain('filePath: "src/a.ts", oldStart: 10');
    }
  });

  it("throws with an extra hunk not present in the diff", () => {
    try {
      validateHunkCoverage(files, [
        chapter(
          { filePath: "src/a.ts", oldStart: 1 },
          { filePath: "src/a.ts", oldStart: 10 },
          { filePath: "src/b.ts", oldStart: 5 },
          { filePath: "src/ghost.ts", oldStart: 99 },
        ),
      ]);
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as HunkCoverageError;
      expect(err).toBeInstanceOf(HunkCoverageError);
      expect(err.extra).toEqual([{ filePath: "src/ghost.ts", oldStart: 99 }]);
      expect(err.missing).toEqual([]);
      expect(err.message).toContain("Extra hunks (1)");
    }
  });

  it("throws with a duplicate hunk assigned to two chapters", () => {
    try {
      validateHunkCoverage(files, [
        chapter({ filePath: "src/a.ts", oldStart: 1 }, { filePath: "src/a.ts", oldStart: 10 }),
        chapter({ filePath: "src/b.ts", oldStart: 5 }, { filePath: "src/a.ts", oldStart: 1 }),
      ]);
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as HunkCoverageError;
      expect(err).toBeInstanceOf(HunkCoverageError);
      expect(err.duplicates).toEqual([{ filePath: "src/a.ts", oldStart: 1 }]);
      expect(err.message).toContain("Duplicate hunks (1)");
    }
  });

  it("reports missing, extra and duplicate together in order", () => {
    const report = computeCoverage(files, [
      chapter(
        { filePath: "src/a.ts", oldStart: 1 },
        { filePath: "src/a.ts", oldStart: 1 }, // duplicate
        { filePath: "src/ghost.ts", oldStart: 7 }, // extra
      ),
    ]);
    expect(report.missing).toEqual([
      { filePath: "src/a.ts", oldStart: 10 },
      { filePath: "src/b.ts", oldStart: 5 },
    ]);
    expect(report.extra).toEqual([{ filePath: "src/ghost.ts", oldStart: 7 }]);
    expect(report.duplicates).toEqual([{ filePath: "src/a.ts", oldStart: 1 }]);
  });
});

describe("findUnassignedHunks", () => {
  it("is the non-throwing parity of the missing set", () => {
    expect(findUnassignedHunks(files, [chapter({ filePath: "src/a.ts", oldStart: 1 })])).toEqual([
      { filePath: "src/a.ts", oldStart: 10 },
      { filePath: "src/b.ts", oldStart: 5 },
    ]);
  });

  it("returns [] when all assigned", () => {
    expect(
      findUnassignedHunks(files, [
        chapter(
          { filePath: "src/a.ts", oldStart: 1 },
          { filePath: "src/a.ts", oldStart: 10 },
          { filePath: "src/b.ts", oldStart: 5 },
        ),
      ]),
    ).toEqual([]);
  });
});

describe("buildOtherChangesChapter", () => {
  it("returns null when nothing is excluded", () => {
    expect(buildOtherChangesChapter(files, [])).toBeNull();
  });

  it("covers exactly the excluded hunks with keyChanges []", () => {
    const allFiles = [...files, fileWith("pnpm-lock.yaml", [1, 8])];
    const chapter = buildOtherChangesChapter(allFiles, ["pnpm-lock.yaml"]);
    expect(chapter).not.toBeNull();
    expect(chapter?.id).toBe("chapter-other-changes");
    expect(chapter?.title).toBe("Other changes");
    expect(chapter?.keyChanges).toEqual([]);
    expect(chapter?.hunkRefs).toEqual([
      { filePath: "pnpm-lock.yaml", oldStart: 1 },
      { filePath: "pnpm-lock.yaml", oldStart: 8 },
    ]);
  });

  it("the other-changes bucket satisfies coverage for the excluded files", () => {
    const allFiles = [fileWith("pnpm-lock.yaml", [1, 8])];
    const chapter = buildOtherChangesChapter(allFiles, ["pnpm-lock.yaml"]);
    if (!chapter) {
      throw new Error("expected chapter");
    }
    expect(() => validateHunkCoverage(allFiles, [chapter])).not.toThrow();
  });
});
