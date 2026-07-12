import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Prologue } from "@folio/types";

import { ReviewPrologue } from "./review-prologue.js";

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
  motivation: "리뷰 배경을 먼저 이해해야 합니다.",
  outcome: "총정리와 흐름도를 한 화면에서 제공합니다.",
  diagram: "flowchart LR\nA[Diff] --> B[Summary]",
  keyChanges: [{ summary: "총정리 추가", description: "구조화 데이터를 표시합니다." }],
  focusAreas: [
    {
      type: "architecture",
      severity: "high",
      title: "렌더링 경계",
      description: "렌더링 실패가 격리되는지 확인하세요.",
      locations: ["apps/web/src/components/review/mermaid-diagram.tsx"],
    },
  ],
  complexity: { level: "high", reasoning: "API와 브라우저 렌더링이 함께 바뀝니다." },
};

describe("ReviewPrologue", () => {
  it("renders Summary first with all generated sections", () => {
    const markup = renderToStaticMarkup(
      <ReviewPrologue pr={pr} prologue={prologue} comments={[]} />,
    );

    expect(markup).toContain("요약");
    expect(markup).toContain("설명");
    expect(markup).toContain("댓글 0");
    expect(markup).toContain("왜 이 PR인가?");
    expect(markup).toContain("무엇을 하는가");
    expect(markup).toContain("핵심 변경");
    expect(markup).toContain("리뷰 포커스");
    expect(markup).toContain(prologue.motivation);
    expect(markup).toContain("space-y-4 rounded-lg border bg-card p-4");
    expect(markup).toContain("text-sm leading-6");
    expect(markup).not.toContain(pr.body);
    expect(markup).not.toContain("MoreHorizontal");
  });

  it("omits Summary and starts with Description without a prologue", () => {
    const markup = renderToStaticMarkup(<ReviewPrologue pr={pr} prologue={null} comments={[]} />);

    expect(markup).not.toContain("요약");
    expect(markup).toContain("설명");
    expect(markup).toContain("댓글 0");
    expect(markup).toContain(pr.body);
  });
});
