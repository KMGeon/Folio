import { filterFilesForLlm, parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import { describe, expect, it } from "vitest";
import { buildFallbackChapters, collectHunkRefs } from "../fallback.js";
import { allHunkRefs, readFixture } from "./helpers.js";

describe("buildFallbackChapters", () => {
  it("small PRs still get a concrete task title instead of a generic chapter", () => {
    const diff = readFixture("tiny-pr.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    expect(chapters.length).toBe(1);
    expect(chapters[0]?.title).toBe("src 작업 수정");
    expect(chapters[0]?.summary).toContain("src/util.ts");
    expect(chapters[0]?.title).not.toBe("Apply changes");
    expect(chapters[0]?.hunkRefs).toEqual(collectHunkRefs(files));
  });

  it("groups fallback stages by task area instead of one stage per file", () => {
    const diff = readFixture("multi-dir.diff");
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 3);
    expect(chapters.length).toBe(2);
    expect(chapters.map((c) => c.title)).toEqual(["api 작업 수정", "web 작업 수정"]);
    expect(chapters[0]?.hunkRefs.map((r) => r.filePath)).toEqual([
      "api/routes.ts",
      "api/handlers.ts",
    ]);
    expect(chapters[1]?.hunkRefs.map((r) => r.filePath)).toEqual(["web/App.tsx", "web/Badge.tsx"]);
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

  it("groups related implementation and package changes into task stages", () => {
    const diff = readFixture("with-lockfile.diff");
    // Reviewable files: src/server.ts + package.json (root). Lockfile excluded.
    const { files } = filterFilesForLlm(parseUnifiedDiff(diff));
    const chapters = buildFallbackChapters(files, 1);
    expect(chapters.map((c) => c.title)).toEqual(["의존성 설정 수정", "src 작업 수정"]);
    expect(() => validateHunkCoverage(files, chapters)).not.toThrow();
  });
});
