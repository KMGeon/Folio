import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DashboardPage", () => {
  it("renders the PR board dashboard instead of repository access controls", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).toContain("DashboardBoard");
    expect(source).toContain("completedPulls");
    expect(source).toContain("Ready to review");
    expect(source).toContain("Your pull requests");
    expect(source).toContain("Other");
    expect(source).toContain("Recently completed");
    expect(source).not.toContain("RepositoryToggleForm");
    expect(source).not.toContain("activeRepos");
    expect(source).not.toContain("folioEnabled");
  });

  it("keeps dashboard board components in a focused module", async () => {
    const source = await readFile(
      new URL("../components/dashboard/dashboard-board.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("export function DashboardBoard");
    expect(source).toContain("function DashboardColumn");
    expect(source).toContain("function OpenPullCard");
    expect(source).toContain("function CompletedPullCard");
    expect(source).toContain("function DashboardSearchBar");
    expect(source).toContain("size/XS");
  });
});
