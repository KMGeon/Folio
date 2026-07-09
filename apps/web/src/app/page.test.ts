import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DashboardPage", () => {
  it("renders the lazy PR board dashboard instead of waiting for full card arrays", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).toContain("DashboardBoardClient");
    expect(source).toContain("fetchDashboardSummary");
    expect(source).toContain("Ready to review");
    expect(source).toContain("Your pull requests");
    expect(source).toContain("Other");
    expect(source).toContain("Recently completed");
    expect(source).not.toContain("completedPulls={");
    expect(source).not.toContain("RepositoryToggleForm");
  });

  it("keeps dashboard board components split by concrete responsibility", async () => {
    const board = await readFile(
      new URL("../components/dashboard/dashboard-board.tsx", import.meta.url),
      "utf8",
    );
    const client = await readFile(
      new URL("../components/dashboard/dashboard-board-client.tsx", import.meta.url),
      "utf8",
    );
    const filters = await readFile(
      new URL("../components/dashboard/dashboard-filter-panel.tsx", import.meta.url),
      "utf8",
    );
    const skeleton = await readFile(
      new URL("../components/dashboard/dashboard-skeleton.tsx", import.meta.url),
      "utf8",
    );

    expect(board).toContain("export function DashboardBoard");
    expect(board).toContain("function OpenPullCard");
    expect(board).toContain("function CompletedPullCard");
    expect(client).toContain("IntersectionObserver");
    expect(client).toContain("fetchDashboardPullPage");
    expect(filters).toContain("DashboardFilterPanel");
    expect(filters).toContain("Closed reviews");
    expect(skeleton).toContain("DashboardSkeletonCard");
  });
});
