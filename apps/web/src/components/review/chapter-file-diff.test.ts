import { describe, expect, it } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import { buildFileScopedChapter } from "./chapter-file-diff";

const chapter: ReviewChapter = {
  index: 1,
  title: "Chapter",
  summary: "Summary",
  files: [
    { path: "a.ts", status: "added", additions: 1, deletions: 0 },
    { path: "b.ts", status: "deleted", additions: 0, deletions: 1 },
  ],
  diffLines: [
    { path: "a.ts", n: 2, kind: "add", text: "a", newLineNumber: 2 },
    { path: "b.ts", n: 4, kind: "del", text: "b", oldLineNumber: 4 },
  ],
  viewed: false,
};

describe("buildFileScopedChapter", () => {
  it("keeps chapter metadata but only includes the selected file lines and file summary", () => {
    expect(buildFileScopedChapter(chapter, "b.ts")).toEqual({
      ...chapter,
      files: [{ path: "b.ts", status: "deleted", additions: 0, deletions: 1 }],
      diffLines: [{ path: "b.ts", n: 4, kind: "del", text: "b", oldLineNumber: 4 }],
    });
  });
});
