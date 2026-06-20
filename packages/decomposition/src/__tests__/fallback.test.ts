import { filterFilesForLlm, parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import { describe, expect, it } from "vitest";
import { buildFallbackChapters, collectHunkRefs } from "../fallback.js";
import { allHunkRefs, readFixture } from "./helpers.js";

describe("buildFallbackChapters", () => {
  it("tiny-PR rule: <= threshold hunks → a single chapter", () => {
    const diff = readFixture("tiny-pr.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    expect(chapters.length).toBe(1);
    expect(chapters[0]?.hunkRefs).toEqual(collectHunkRefs(files));
  });

  it("directory grouping: multi-dir PR → one chapter per top-level dir", () => {
    const diff = readFixture("multi-dir.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    // api/ and web/ → 2 chapters.
    expect(chapters.length).toBe(2);
    const titles = chapters.map((c) => c.title).sort();
    expect(titles).toEqual(["Update api", "Update web"]);
    // Orders are 1-indexed and contiguous.
    expect(chapters.map((c) => c.order)).toEqual([1, 2]);
  });

  it("covers 100% of hunks exactly once", () => {
    const diff = readFixture("multi-dir.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    expect(() => validateHunkCoverage(files, chapters)).not.toThrow();
    // Union of refs equals every reviewable hunk.
    const assigned = chapters.flatMap((c) => c.hunkRefs);
    expect(assigned.length).toBe(allHunkRefs(files).length);
  });

  it("returns [] for an empty file list", () => {
    expect(buildFallbackChapters([], 3)).toEqual([]);
  });

  it("groups top-level (root) files under a root chapter", () => {
    const diff = readFixture("with-lockfile.diff");
    // Reviewable files: src/server.ts + package.json (root). Lockfile excluded.
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 1);
    const titles = chapters.map((c) => c.title);
    expect(titles).toContain("Update root-level files");
    expect(titles).toContain("Update src");
    expect(() => validateHunkCoverage(files, chapters)).not.toThrow();
  });
});
