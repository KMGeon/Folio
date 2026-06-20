import { describe, expect, it } from "vitest";
import { buildUserPrompt } from "../prompt.js";

const HINT = "Prefer a SINGLE chapter unless the changes are genuinely independent.";

describe("buildUserPrompt — small-PR soft hint", () => {
  it("omits the hint when smallPrHunkCount is undefined", () => {
    const out = buildUserPrompt({ diff: "FORMATTED_DIFF", prTitle: "x" }, "FORMATTED_DIFF");
    expect(out).not.toContain(HINT);
    expect(out).toContain("## Task");
    expect(out).toContain("FORMATTED_DIFF");
  });

  it("includes the hint with the hunk count when smallPrHunkCount is set", () => {
    const out = buildUserPrompt({ diff: "FORMATTED_DIFF", prTitle: "x" }, "FORMATTED_DIFF", 2);
    expect(out).toContain("This PR is small (2 reviewable hunks).");
    expect(out).toContain(HINT);
  });
});
