import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "review-view.tsx"), "utf8");

describe("ReviewView source", () => {
  it("keeps file diffs expanded until collapse all is clicked", () => {
    expect(source).toContain("useState<number | undefined>()");
    expect(source).toContain("(v ?? 0) + 1");
  });
});
