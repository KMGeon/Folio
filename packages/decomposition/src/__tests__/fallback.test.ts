import { filterFilesForLlm, parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import { describe, expect, it } from "vitest";
import { buildFallbackChapters, collectHunkRefs } from "../fallback.js";
import { allHunkRefs, readFixture } from "./helpers.js";

describe("buildFallbackChapters", () => {
  it("small PRs still get a file-stage title instead of a generic chapter", () => {
    const diff = readFixture("tiny-pr.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    expect(chapters.length).toBe(1);
    expect(chapters[0]?.title).toBe("src/util.ts 수정");
    expect(chapters[0]?.summary).toContain("src/util.ts");
    expect(chapters[0]?.title).not.toBe("Apply changes");
    expect(chapters[0]?.hunkRefs).toEqual(collectHunkRefs(files));
  });

  it("groups fallback stages by changed file work, not top-level directory", () => {
    const diff = readFixture("multi-dir.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    expect(chapters.length).toBe(4);
    expect(chapters.map((c) => c.title)).toEqual([
      "api/routes.ts 수정",
      "api/handlers.ts 수정",
      "web/App.tsx 수정",
      "web/Badge.tsx 추가",
    ]);
    // Orders are 1-indexed and contiguous.
    expect(chapters.map((c) => c.order)).toEqual([1, 2, 3, 4]);
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

  it("keeps root files as their own Korean file-stage chapter", () => {
    const diff = readFixture("with-lockfile.diff");
    // Reviewable files: src/server.ts + package.json (root). Lockfile excluded.
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 1);
    const titles = chapters.map((c) => c.title);
    expect(titles).toContain("src/server.ts 수정");
    expect(titles).toContain("package.json 수정");
    expect(() => validateHunkCoverage(files, chapters)).not.toThrow();
  });
});
