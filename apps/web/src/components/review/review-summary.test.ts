import { describe, expect, it } from "vitest";

import type { Prologue } from "@folio/types";

import { resolvePlainSummary } from "./review-summary.js";

const base: Prologue = {
  plainSummary: null,
  motivation: null,
  outcome: null,
  diagram: null,
  keyChanges: [],
  focusAreas: [],
  complexity: { level: "low", reasoning: "small" },
};

describe("resolvePlainSummary", () => {
  it("prefers the dedicated AI plainSummary field", () => {
    expect(
      resolvePlainSummary({
        ...base,
        plainSummary: "리뷰 화면을 더 읽기 쉽게 만듭니다.",
        motivation: "기술 배경",
        outcome: "기술 결과",
      }),
    ).toBe("리뷰 화면을 더 읽기 쉽게 만듭니다.");
  });

  it("falls back to motivation and outcome for older prologues", () => {
    expect(
      resolvePlainSummary({
        ...base,
        motivation: "검토자가 상태를 빠르게 읽기 어렵습니다.",
        outcome: "패널 간격을 넓혀 읽기 쉽게 합니다.",
      }),
    ).toBe("검토자가 상태를 빠르게 읽기 어렵습니다. 패널 간격을 넓혀 읽기 쉽게 합니다.");
  });

  it("returns null when nothing is available", () => {
    expect(resolvePlainSummary(base)).toBeNull();
  });
});
