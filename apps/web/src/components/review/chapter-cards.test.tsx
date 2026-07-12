import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReviewChapter } from "@/lib/review-api";

import { ChapterCards } from "./chapter-cards.js";

globalThis.React = React;

const chapters: ReviewChapter[] = [
  {
    index: 1,
    title: "Files 탭 검색 동기화",
    summary: "필터와 선택 보정을 review-view에 연결합니다.",
    files: [
      { path: "a.ts", status: "modified", additions: 10, deletions: 2, viewed: false },
      { path: "b.ts", status: "added", additions: 5, deletions: 0, viewed: false },
    ],
    diffLines: [],
    keyChanges: [
      { id: "k1", content: "빈 필터 상태가 충분한가요?", lineRefs: [], viewed: false },
      { id: "k2", content: "선택 null 처리가 맞나요?", lineRefs: [], viewed: true },
      { id: "k3", content: "로케일 lower-case가 안전한가요?", lineRefs: [], viewed: false },
      { id: "k4", content: "네 번째 질문은 더보기 대상", lineRefs: [], viewed: false },
    ],
    viewed: false,
  },
];

describe("ChapterCards overview focus preview", () => {
  it("renders progress chips, summary, and up to three focus questions", () => {
    const markup = renderToStaticMarkup(
      <ChapterCards chapters={chapters} onSelect={() => undefined} />,
    );

    expect(markup).toContain("Files 탭 검색 동기화");
    expect(markup).toContain("필터와 선택 보정을 review-view에 연결합니다.");
    expect(markup).toContain("검토 1/4");
    expect(markup).toContain("파일 0/2");
    expect(markup).toContain("검토할 사항");
    expect(markup).toContain("빈 필터 상태가 충분한가요?");
    expect(markup).toContain("선택 null 처리가 맞나요?");
    expect(markup).toContain("로케일 lower-case가 안전한가요?");
    expect(markup).toContain("+ 검토 사항 1개 더 · 챕터에서 전부 보기");
    expect(markup).not.toContain("네 번째 질문은 더보기 대상");
    expect(markup).toContain("리뷰 시작");
  });
});
