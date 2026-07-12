import { describe, expect, it } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import { chapterLocalProgress, chapterMilestoneProgress } from "./review-progress.js";

function chapter(partial: Partial<ReviewChapter>): ReviewChapter {
  return {
    index: 1,
    title: "t",
    summary: "s",
    files: [],
    diffLines: [],
    keyChanges: [],
    viewed: false,
    ...partial,
  };
}

describe("chapterMilestoneProgress", () => {
  it("counts viewed chapters", () => {
    expect(
      chapterMilestoneProgress([
        chapter({ viewed: true }),
        chapter({ index: 2, viewed: false }),
        chapter({ index: 3, viewed: true }),
      ]),
    ).toEqual({ done: 2, total: 3 });
  });
});

describe("chapterLocalProgress", () => {
  it("tracks focus and files independently", () => {
    expect(
      chapterLocalProgress(
        chapter({
          files: [
            { path: "a.ts", status: "modified", additions: 1, deletions: 0, viewed: true },
            { path: "b.ts", status: "modified", additions: 1, deletions: 0, viewed: false },
          ],
          keyChanges: [
            { id: "1", content: "q1", lineRefs: [], viewed: true },
            { id: "2", content: "q2", lineRefs: [], viewed: false },
          ],
        }),
      ),
    ).toEqual({
      focusDone: 1,
      focusTotal: 2,
      filesDone: 1,
      filesTotal: 2,
      focusComplete: false,
    });
  });

  it("treats empty focus as complete", () => {
    expect(chapterLocalProgress(chapter({ keyChanges: [] })).focusComplete).toBe(true);
  });
});
