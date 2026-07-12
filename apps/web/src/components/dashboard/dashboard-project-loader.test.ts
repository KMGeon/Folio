import { describe, expect, it, vi } from "vitest";

import { loadDashboardProjectData } from "./dashboard-project-loader";

describe("loadDashboardProjectData", () => {
  it("loads open and complete previews inside the exact repository scope", async () => {
    const open = vi.fn(async () => ({
      ready: { items: [], nextCursor: null, count: 2 },
      yours: { items: [], nextCursor: null, count: 1 },
      other: { items: [], nextCursor: null, count: 0 },
    }));
    const completed = vi.fn(async () => ({ items: [], nextCursor: null, count: 7 }));
    const repo = {
      id: "repo-folio",
      fullName: "KMGeon/Folio",
      openPrCount: 3,
      folioEnabled: true,
    };

    const project = await loadDashboardProjectData(
      repo,
      {
        q: "parser",
        ordering: "updated",
        direction: "desc",
        closedRange: "7d",
        showDrafts: false,
      },
      { fetchOpenPages: open, fetchPullPage: completed },
    );

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ repository: "KMGeon/Folio", q: "parser", limit: 3 }),
    );
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: "KMGeon/Folio",
        bucket: "completed",
        closedRange: "7d",
        limit: 3,
      }),
    );
    expect(project.pages.ready.count).toBe(2);
    expect(project.pages.completed.count).toBe(7);
  });
});
