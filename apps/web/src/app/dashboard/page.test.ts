import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DashboardPage", () => {
  it("keeps authenticated dashboard loading in the client project desk", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).toContain("DashboardBoardClient");
    expect(source).toContain("getMe");
    expect(source).toContain('redirect("/login?redirect=/dashboard")');
    expect(source).not.toContain("fetchDashboardSummary");
    expect(source).toContain("avatarUrl: user.avatarUrl");
    expect(source).not.toContain("completedPulls={");
    expect(source).not.toContain("RepositoryToggleForm");
    // Masthead lives in the client H2 compact header, not the page shell.
    expect(source).not.toContain("Welcome back");
  });

  it("keeps project-first desk components split by concrete responsibility", async () => {
    const client = await readFile(
      new URL("../../components/dashboard/dashboard-board-client.tsx", import.meta.url),
      "utf8",
    );
    const desk = await readFile(
      new URL("../../components/dashboard/dashboard-desk.tsx", import.meta.url),
      "utf8",
    );
    const projectView = await readFile(
      new URL("../../components/dashboard/dashboard-project-view.tsx", import.meta.url),
      "utf8",
    );
    const filters = await readFile(
      new URL("../../components/dashboard/dashboard-filter-panel.tsx", import.meta.url),
      "utf8",
    );
    const skeleton = await readFile(
      new URL("../../components/dashboard/dashboard-skeleton.tsx", import.meta.url),
      "utf8",
    );

    expect(client).toContain("useDashboardProjects");
    expect(client).toContain("fetchDashboardPullPage");
    expect(desk).toContain("DashboardProjectSidebar");
    expect(desk).toContain("DashboardProjectBar");
    expect(projectView).toContain("All projects review sections");
    expect(filters).toContain("DashboardFilterPanel");
    expect(filters).toContain("Closed reviews");
    expect(skeleton).toContain("DashboardSkeletonCard");
  });
});
