import { describe, expect, it } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import { aggregateChangedFiles } from "./changed-file-summary";

const chapters: ReviewChapter[] = [
  {
    index: 1,
    title: "Setup",
    summary: "Adds setup",
    files: [
      { path: "src/a.ts", status: "added", additions: 2, deletions: 0 },
      { path: "src/b.ts", status: "modified", additions: 1, deletions: 1 },
    ],
    diffLines: [],
    viewed: false,
  },
  {
    index: 2,
    title: "Cleanup",
    summary: "Continues setup",
    files: [{ path: "src/a.ts", status: "added", additions: 3, deletions: 0 }],
    diffLines: [],
    viewed: true,
  },
];

describe("aggregateChangedFiles", () => {
  it("dedupes by path, sums line counts, and preserves file status", () => {
    expect(aggregateChangedFiles(chapters)).toEqual([
      {
        path: "src/a.ts",
        status: "added",
        additions: 5,
        deletions: 0,
        chapterIndex: 1,
        chapterTitle: "Setup",
      },
      {
        path: "src/b.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        chapterIndex: 1,
        chapterTitle: "Setup",
      },
    ]);
  });
});
