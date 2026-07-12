import { describe, expect, it } from "vitest";
import { PrologueSchema } from "./prologue.js";

const base = {
  motivation: null,
  outcome: null,
  keyChanges: [],
  focusAreas: [],
  complexity: { level: "low", reasoning: "small change" },
};

describe("PrologueSchema", () => {
  it("defaults plainSummary and diagram to null when omitted", () => {
    const parsed = PrologueSchema.parse(base);
    expect(parsed.plainSummary).toBeNull();
    expect(parsed.diagram).toBeNull();
  });

  it("accepts plainSummary, nullable motivation/outcome, and a diagram", () => {
    const parsed = PrologueSchema.parse({
      ...base,
      plainSummary: "리뷰 화면을 더 읽기 쉽게 정리합니다.",
      motivation: "fix a bug",
      outcome: "bug fixed",
      diagram: "graph TD; A-->B",
    });
    expect(parsed.plainSummary).toBe("리뷰 화면을 더 읽기 쉽게 정리합니다.");
    expect(parsed.motivation).toBe("fix a bug");
    expect(parsed.diagram).toBe("graph TD; A-->B");
  });

  it("rejects an invalid complexity level", () => {
    expect(
      PrologueSchema.safeParse({
        ...base,
        complexity: { level: "extreme", reasoning: "x" },
      }).success,
    ).toBe(false);
  });

  it("validates focus areas", () => {
    const parsed = PrologueSchema.parse({
      ...base,
      focusAreas: [
        {
          type: "security",
          severity: "critical",
          title: "Auth bypass",
          description: "check this",
          locations: ["a.ts"],
        },
      ],
    });
    expect(parsed.focusAreas).toHaveLength(1);
  });
});
