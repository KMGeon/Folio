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
  it("defaults diagram to null when omitted", () => {
    const parsed = PrologueSchema.parse(base);
    expect(parsed.diagram).toBeNull();
  });

  it("accepts nullable motivation/outcome and a diagram", () => {
    const parsed = PrologueSchema.parse({
      ...base,
      motivation: "fix a bug",
      outcome: "bug fixed",
      diagram: "graph TD; A-->B",
    });
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
