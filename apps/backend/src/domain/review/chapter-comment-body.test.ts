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
      { order: 1, title: "캐시 타입에 리뷰 힌트 추가" },
      { order: 2, title: "상위 행에서 오래된 리뷰 필터링" },
    ],
  };

  it("lists each chapter with a deep link to its index", () => {
    const body = buildChapterCommentBody(input);
    expect(body).toContain("이 PR은 2개의 Stage로 정리되었습니다.");
    expect(body).toContain("[캐시 타입에 리뷰 힌트 추가]");
    expect(body).toContain("https://stagereview.app/stablyai/orca/pull/5902/chapters/1");
    expect(body).toContain("https://stagereview.app/stablyai/orca/pull/5902/chapters/2");
    expect(body).toContain("ef578b0");
  });

  it("handles a single chapter (singular copy)", () => {
    const body = buildChapterCommentBody({ ...input, chapters: [input.chapters[0]!] });
    expect(body).toContain("이 PR은 1개의 Stage로 정리되었습니다.");
  });
});
