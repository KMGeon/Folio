import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Prologue } from "@folio/types";

import type { ReviewChapter } from "@/lib/review-api";

import { ReviewPrologue } from "./review-prologue.js";

globalThis.React = React;

const pr = {
  org: "acme",
  repo: "widget",
  number: 7,
  title: "PR",
  body: "Original PR body",
  status: "open" as const,
  author: "octo",
  htmlUrl: "https://github.com/acme/widget/pull/7",
  headSha: "head",
  baseBranch: "main",
  headBranch: "summary",
};

const prologue: Prologue = {
  plainSummary: "PR 요약을 한 화면에서 바로 이해할 수 있게 만듭니다.",
  motivation: "리뷰 배경을 먼저 이해해야 합니다.",
  outcome: "총정리와 흐름도를 한 화면에서 제공합니다.",
  diagram: "flowchart LR\nA[Diff] --> B[Summary]",
  keyChanges: [{ summary: "총정리 추가", description: "구조화 데이터를 표시합니다." }],
  focusAreas: [
    {
      type: "architecture",
      severity: "medium",
      title: "렌더링 경계",
      description: "렌더링 실패가 격리되는지 확인하세요.",
      locations: ["apps/web/src/components/review/mermaid-diagram.tsx"],
    },
  ],
  complexity: { level: "medium", reasoning: "API와 브라우저 렌더링이 함께 바뀝니다." },
};

const chapter: ReviewChapter = {
  index: 1,
  title: "앵커 행으로 점프 강조",
  summary: "키 변경으로 연결된 줄만 강조합니다.",
  files: [],
  diffLines: [],
  keyChanges: [
    {
      id: "anchor-row",
      content: "점프 강조를 앵커 행으로 제한",
      lineRefs: [],
      viewed: false,
    },
  ],
  viewed: false,
};

describe("ReviewPrologue", () => {
  it("renders the paired summary and review table first", () => {
    const markup = renderToStaticMarkup(
      <ReviewPrologue
        pr={pr}
        prologue={prologue}
        comments={[]}
        chapters={[chapter]}
        onSelectChapter={() => {}}
      />,
    );

    expect(markup).toContain("요약");
    expect(markup).toContain("설명");
    expect(markup).toContain("댓글 0");
    expect(markup).toContain("변경 요약");
    expect(markup).toContain("리뷰");
    expect(markup).toContain("점프 강조를 앵커 행으로 제한");
    expect(markup).toContain("한눈에 보기");
    expect(markup).toContain(prologue.plainSummary);
    expect(markup).toContain("왜 이 PR인가?");
    expect(markup).toContain("핵심 변경");
    expect(markup).toContain("리뷰 포커스");
    expect(markup).toContain(prologue.motivation);

    expect(markup).not.toContain(pr.body);
  });

  it("omits Summary and starts with Description without a prologue", () => {
    const markup = renderToStaticMarkup(
      <ReviewPrologue
        pr={pr}
        prologue={null}
        comments={[]}
        chapters={[]}
        onSelectChapter={() => {}}
      />,
    );

    expect(markup).not.toContain("요약");
    expect(markup).toContain("설명");
    expect(markup).toContain("댓글 0");
    expect(markup).toContain(pr.body);
  });
});
