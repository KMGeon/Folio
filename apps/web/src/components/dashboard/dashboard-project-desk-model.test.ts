import { describe, expect, it } from "vitest";

import {
  dashboardEmptyDescription,
  dashboardEmptyTitle,
  dashboardNextPull,
  dashboardProjectCounts,
  dashboardProjectName,
  dashboardScopeCounts,
  dashboardScopeName,
  type DashboardProjectData,
} from "./dashboard-project-desk-model";

describe("dashboard project desk model", () => {
  const folio = project("repo-folio", "KMGeon/Folio", { ready: 2, yours: 1, other: 3, done: 5 });
  const orca = project("repo-orca", "KMGeon/orca", { ready: 3, yours: 0, other: 1, done: 2 });

  it("derives project identity without losing the full repository scope", () => {
    expect(dashboardProjectName("KMGeon/Folio")).toBe("Folio");
    expect(dashboardScopeName(null)).toBe("All projects");
    expect(dashboardScopeName(folio.repo)).toBe("Folio");
  });

  it("keeps metrics on the selected project axis", () => {
    expect(dashboardProjectCounts(folio)).toEqual({ ready: 2, yours: 1, completed: 5 });
    expect(dashboardScopeCounts([folio, orca], null)).toEqual({
      ready: 5,
      yours: 1,
      completed: 7,
    });
    expect(dashboardScopeCounts([folio, orca], "repo-folio")).toEqual({
      ready: 2,
      yours: 1,
      completed: 5,
    });
  });

  it("selects next-up inside the project and chip focus", () => {
    expect(dashboardNextPull(folio, "ready")?.title).toBe("ready 1");
    expect(dashboardNextPull(folio, "yours")?.title).toBe("yours 1");
    expect(dashboardNextPull(folio, "completed")).toBeNull();

    const onlyOther = project("repo-docs", "KMGeon/docs", {
      ready: 0,
      yours: 0,
      other: 1,
      done: 0,
    });
    expect(dashboardNextPull(onlyOther, "ready")).toBeNull();
  });

  it("always names the active scope in empty copy", () => {
    expect(dashboardEmptyTitle("Folio")).toContain("Folio");
    expect(dashboardEmptyTitle("All projects")).toContain("All projects");
    expect(dashboardEmptyDescription("Folio", "ready")).toContain("Folio");
    expect(dashboardEmptyDescription("Folio", "completed")).toContain("Folio");
  });
});

function project(
  id: string,
  fullName: string,
  counts: { ready: number; yours: number; other: number; done: number },
): DashboardProjectData {
  return {
    repo: { id, fullName, folioEnabled: true, openPrCount: 0 },
    pages: {
      ready: page("ready", counts.ready),
      yours: page("yours", counts.yours),
      other: page("other", counts.other),
      completed: page("completed", counts.done),
    },
    isLoading: false,
    error: null,
  };
}

function page(bucket: "ready" | "yours" | "other" | "completed", count: number) {
  return {
    count,
    nextCursor: null,
    items: Array.from({ length: Math.min(count, 2) }, (_, index) => ({
      id: `${bucket}-${index + 1}`,
      title: `${bucket} ${index + 1}`,
    })) as never,
  };
}
