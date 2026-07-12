import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Prologue } from "@folio/types";

import type { ReviewChapter } from "@/lib/review-api";

import { buildSummaryReviewRows, SummaryReviewTable } from "./summary-review-table.js";

globalThis.React = React;

vi.mock("@/components/review/mermaid-diagram", () => ({
  MermaidDiagram: ({ source, label }: { source: string; label: string }) =>
    React.createElement("output", { "data-source": source }, label),
}));

const prologue: Prologue = {
  plainSummary: "리뷰 화면을 한 번에 읽을 수 있게 정리합니다.",
  motivation: "요약과 검토 대상을 함께 볼 필요가 있습니다.",
  outcome: "요약과 챕터를 나란히 표시합니다.",
  diagram: "flowchart LR\nSummary-->Chapter",
  keyChanges: [{ summary: "요약 테이블", description: "요약과 리뷰를 한 행에 배치합니다." }],
  focusAreas: [
    {
      type: "architecture",
      severity: "high",
      title: "요약 표시 경로",
      description: "요약 셀에서 모든 PR 맥락을 유지해야 합니다.",
      locations: ["apps/web/src/components/review/summary-review-table.tsx"],
    },
  ],
  complexity: { level: "medium", reasoning: "표시 경로와 클라이언트 렌더링이 함께 바뀝니다." },
};

function chapter(index: number): ReviewChapter {
  return {
    index,
    title: `챕터 ${index}`,
    summary: `챕터 ${index} 요약`,
    files: [],
    diffLines: [],
    keyChanges: [],
    viewed: false,
  };
}

describe("SummaryReviewTable", () => {
  it("pairs the four summary sections with ordered chapters", () => {
    const rows = buildSummaryReviewRows(prologue, [chapter(1), chapter(2)]);

    expect(rows.map((row) => row.id)).toEqual(["overview", "purpose", "changes", "focus"]);
    expect(rows[0]?.chapter?.index).toBe(1);
    expect(rows[2]?.chapter).toBeNull();
  });

  it("renders paired summary and review columns with responsive labels", () => {
    const markup = renderToStaticMarkup(
      <SummaryReviewTable prologue={prologue} chapters={[chapter(1)]} onSelectChapter={() => {}} />,
    );

    expect(markup).toContain("변경 요약");
    expect(markup).toContain("리뷰");
    expect(markup).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]");
    expect(markup).toContain("lg:hidden");
  });

  it("retains the outcome and Mermaid diagram in the purpose summary cell", () => {
    const markup = renderToStaticMarkup(
      <SummaryReviewTable prologue={prologue} chapters={[]} onSelectChapter={() => {}} />,
    );

    expect(markup).toContain(prologue.outcome);
    expect(markup).toContain("PR 변경 흐름도");
    expect(markup).toContain('data-source="flowchart LR\nSummary--&gt;Chapter"');
  });

  it("retains complexity, severity, and source locations in the focus summary cell", () => {
    const markup = renderToStaticMarkup(
      <SummaryReviewTable prologue={prologue} chapters={[]} onSelectChapter={() => {}} />,
    );

    expect(markup).toContain("medium");
    expect(markup).toContain(prologue.complexity.reasoning);
    expect(markup).toContain("high");
    expect(markup).toContain("요약 표시 경로");
    expect(markup).toContain("요약 셀에서 모든 PR 맥락을 유지해야 합니다.");
    expect(markup).toContain("apps/web/src/components/review/summary-review-table.tsx");
  });
});
