import { describe, expect, it } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import {
  areFilePathsCollapsed,
  fileProgress,
  groupLinesByFile,
  setFilePathsCollapsed,
  viewedFileCollapseState,
} from "./review-file-state";

const chapter: ReviewChapter = {
  index: 1,
  title: "Chapter",
  summary: "Summary",
  files: [
    { path: "a.ts", status: "added", additions: 2, deletions: 0, viewed: true },
    { path: "b.ts", status: "deleted", additions: 0, deletions: 1, viewed: false },
  ],
  diffLines: [
    { path: "a.ts", n: 1, kind: "add", text: "a", newLineNumber: 1 },
    { path: "a.ts", n: 2, kind: "add", text: "b", newLineNumber: 2 },
    { path: "b.ts", n: 3, kind: "del", text: "c", oldLineNumber: 3 },
  ],
  keyChanges: [],
  viewed: false,
};

describe("review file state helpers", () => {
  it("counts viewed files", () => {
    expect(fileProgress(chapter.files)).toEqual({ viewed: 1, total: 2 });
  });

  it("groups diff lines by file in chapter file order", () => {
    expect(groupLinesByFile(chapter).map((group) => [group.file.path, group.lines.length])).toEqual(
      [
        ["a.ts", 2],
        ["b.ts", 1],
      ],
    );
  });

  it("collapses viewed files initially", () => {
    expect(viewedFileCollapseState([chapter])).toEqual({ "a.ts": true });
  });

  it("collapses and expands all requested file paths", () => {
    const paths = ["a.ts", "b.ts"];
    const collapsed = setFilePathsCollapsed({}, paths, true);

    expect(areFilePathsCollapsed(collapsed, paths)).toBe(true);
    expect(setFilePathsCollapsed(collapsed, paths, false)).toEqual({
      "a.ts": false,
      "b.ts": false,
    });
  });
});
