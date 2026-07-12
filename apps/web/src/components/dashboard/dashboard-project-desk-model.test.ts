import { describe, expect, it } from "vitest";

import {
  dashboardClassifyPull,
  dashboardCockpitCounts,
  dashboardDefaultFocus,
  dashboardEmptyDescription,
  dashboardEmptyTitle,
  dashboardNextPull,
  dashboardProjectCounts,
  dashboardProjectName,
  dashboardProjectPullsForState,
  dashboardScopeCounts,
  dashboardScopeName,
  type DashboardProjectData,
} from "./dashboard-project-desk-model";

describe("dashboard project desk model", () => {
  const folio = project("repo-folio", "KMGeon/Folio", [
    pull("attention", { analysisStatus: "failed" }),
    pull("ready", { analysisStatus: "complete", status: "ready" }),
    pull("reviewing", { status: "ready", viewedChapters: 1 }),
    pull("processing", { analysisStatus: "processing" }),
  ]);
  const orca = project("repo-orca", "KMGeon/orca", [pull("ready", { status: "ready" })], 2);

  it("derives project identity without losing the full repository scope", () => {
    expect(dashboardProjectName("KMGeon/Folio")).toBe("Folio");
    expect(dashboardScopeName(null)).toBe("All projects");
    expect(dashboardScopeName(folio.repo)).toBe("Folio");
  });

  it("classifies every open pull into a mutually exclusive cockpit state", () => {
    expect(dashboardClassifyPull(pull("failed", { analysisStatus: "failed" }))).toBe("attention");
    expect(dashboardClassifyPull(pull("retrying", { analysisStatus: "retrying" }))).toBe(
      "processing",
    );
    expect(dashboardClassifyPull(pull("reviewing", { status: "ready", viewedChapters: 1 }))).toBe(
      "reviewing",
    );
    expect(
      dashboardClassifyPull(pull("ready", { analysisStatus: "complete", status: "ready" })),
    ).toBe("ready");
    expect(dashboardClassifyPull(pull("fallback"))).toBe("processing");
  });

  it("derives cockpit counts and state pull lists from the open API pages", () => {
    expect(dashboardCockpitCounts(folio)).toEqual({
      attention: 1,
      ready: 1,
      reviewing: 1,
      processing: 1,
      complete: 5,
    });
    expect(dashboardProjectCounts(folio)).toEqual(dashboardCockpitCounts(folio));
    expect(dashboardProjectPullsForState(folio, "reviewing").map((pull) => pull.title)).toEqual([
      "reviewing 1",
    ]);
    expect(dashboardProjectPullsForState(folio, "complete")).toHaveLength(2);
  });

  it("keeps cockpit metrics on the selected project axis", () => {
    expect(dashboardScopeCounts([folio, orca], null)).toEqual({
      attention: 1,
      ready: 2,
      reviewing: 1,
      processing: 1,
      complete: 7,
    });
    expect(dashboardScopeCounts([folio, orca], "repo-folio")).toEqual({
      attention: 1,
      ready: 1,
      reviewing: 1,
      processing: 1,
      complete: 5,
    });
  });

  it("defaults to the first populated state in cockpit priority order", () => {
    expect(
      dashboardDefaultFocus({ attention: 1, ready: 1, reviewing: 1, processing: 1, complete: 5 }),
    ).toBe("attention");
    expect(
      dashboardDefaultFocus({ attention: 0, ready: 0, reviewing: 1, processing: 2, complete: 5 }),
    ).toBe("reviewing");
    expect(
      dashboardDefaultFocus({ attention: 0, ready: 0, reviewing: 0, processing: 0, complete: 5 }),
    ).toBe("complete");
  });

  it("selects next-up inside the project and cockpit focus", () => {
    expect(dashboardNextPull(folio, "ready")?.title).toBe("ready 1");
    expect(dashboardNextPull(folio, "reviewing")?.title).toBe("reviewing 1");
    expect(dashboardNextPull(folio, "complete")).toBeNull();

    const onlyOther = project("repo-docs", "KMGeon/docs", [pull("processing")]);
    expect(dashboardNextPull(onlyOther, "ready")).toBeNull();
  });

  it("always names the active scope in empty copy", () => {
    expect(dashboardEmptyTitle("Folio")).toContain("Folio");
    expect(dashboardEmptyTitle("All projects")).toContain("All projects");
    expect(dashboardEmptyDescription("Folio", "ready")).toContain("Folio");
    expect(dashboardEmptyDescription("Folio", "complete")).toContain("Folio");
  });
});

function project(
  id: string,
  fullName: string,
  openPulls: ReturnType<typeof pull>[],
  completedCount = 5,
): DashboardProjectData {
  return {
    repo: { id, fullName, folioEnabled: true, openPrCount: 0, priority: "normal" },
    pages: {
      ready: page(openPulls.filter((pull) => pull.sourceBucket === "ready")),
      yours: page(openPulls.filter((pull) => pull.sourceBucket === "yours")),
      other: page(openPulls.filter((pull) => pull.sourceBucket === "other")),
      completed: page(
        Array.from({ length: Math.min(completedCount, 2) }, (_, index) => completed(index)),
        completedCount,
      ),
    },
    isLoading: false,
    error: null,
  };
}

function page(items: Record<string, unknown>[], count = items.length) {
  return {
    count,
    nextCursor: null,
    items: items as never,
  };
}

function pull(
  title: string,
  overrides: Partial<{
    analysisStatus: "not_requested" | "processing" | "retrying" | "failed" | "complete";
    status: "ready" | "processing";
    viewedChapters: number;
    sourceBucket: "ready" | "yours" | "other";
  }> = {},
) {
  return {
    id: title,
    title: `${title} 1`,
    org: "KMGeon",
    repo: "Folio",
    number: 1,
    author: "KMGeon",
    updatedAt: "now",
    updatedAtIso: "2026-07-12T00:00:00.000Z",
    headBranch: "feature/cockpit",
    headSha: "head",
    baseBranch: "main",
    githubStatus: "open" as const,
    analysisStatus: "not_requested" as const,
    completedAt: null,
    status: "processing" as const,
    chapterCount: 3,
    viewedChapters: 0,
    changedFiles: 1,
    additions: 1,
    deletions: 0,
    risk: "low" as const,
    sourceBucket: "other" as const,
    ...overrides,
  };
}

function completed(index: number) {
  return {
    id: `completed-${index + 1}`,
    title: `completed ${index + 1}`,
  };
}
