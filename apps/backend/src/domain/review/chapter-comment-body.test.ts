import { describe, expect, it } from "vitest";
import { buildChapterCommentBody } from "./chapter-comment-body.js";

describe("buildChapterCommentBody", () => {
  const input = {
    org: "stablyai",
    repo: "orca",
    number: 5902,
    webBaseUrl: "https://stagereview.app",
    commitSha: "ef578b0",
    chapters: [
      { order: 1, title: "Add linked review hint to cache types" },
      { order: 2, title: "Filter stale linked reviews in parent rows" },
    ],
  };

  it("lists each chapter with a deep link to its index", () => {
    const body = buildChapterCommentBody(input);
    expect(body).toContain("2 individual chapters");
    expect(body).toContain("[Add linked review hint to cache types]");
    expect(body).toContain("https://stagereview.app/stablyai/orca/pull/5902/chapters/1");
    expect(body).toContain("https://stagereview.app/stablyai/orca/pull/5902/chapters/2");
    expect(body).toContain("ef578b0");
  });

  it("handles a single chapter (singular copy)", () => {
    const body = buildChapterCommentBody({ ...input, chapters: [input.chapters[0]!] });
    expect(body).toContain("1 individual chapter");
  });
});
