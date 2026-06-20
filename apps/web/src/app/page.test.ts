import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DashboardPage", () => {
  it("does not render the activity skyline", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("ContributionsSkyline");
  });
});
