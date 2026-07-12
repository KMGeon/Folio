import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Prologue } from "@folio/types";

import type { ReviewChapter } from "@/lib/review-api";

import { buildSummaryReviewRows, SummaryReviewTable } from "./summary-review-table.js";

globalThis.React = React;

const prologue: Prologue = {
  plainSummary: "리뷰 화면을 한 번에 읽을 수 있게 정리합니다.",
  motivation: "요약과 검토 대상을 함께 볼 필요가 있습니다.",
  outcome: "요약과 챕터를 나란히 표시합니다.",
  diagram: null,
  keyChanges: [{ summary: "요약 테이블", description: "요약과 리뷰를 한 행에 배치합니다." }],
  focusAreas: [],
  complexity: { level: "low", reasoning: "작은 UI 조정입니다." },
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
});
