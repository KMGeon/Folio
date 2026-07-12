import { describe, expect, it } from "vitest";

import type { DashboardProjectData } from "./dashboard-project-desk-model";
import {
  appendDashboardProjectPullPage,
  dashboardProjectsForReload,
  selectEnabledDashboardRepos,
} from "./use-dashboard-projects";

describe("selectEnabledDashboardRepos", () => {
  it("keeps only folio-enabled repositories and sorts by full name", () => {
    const selected = selectEnabledDashboardRepos([
      { id: "2", fullName: "KMGeon/zeta", openPrCount: 0, folioEnabled: true },
      { id: "3", fullName: "KMGeon/alpha", openPrCount: 1, folioEnabled: false },
      { id: "1", fullName: "KMGeon/Folio", openPrCount: 2, folioEnabled: true },
    ]);

    expect(selected.map((repo) => repo.fullName)).toEqual(["KMGeon/Folio", "KMGeon/zeta"]);
    expect(selected.every((repo) => repo.folioEnabled)).toBe(true);
  });

  it("returns empty when nothing is enabled in Settings", () => {
    expect(
      selectEnabledDashboardRepos([
        { id: "1", fullName: "KMGeon/a", openPrCount: 0, folioEnabled: false },
      ]),
    ).toEqual([]);
  });

  it("appends a completed page without duplicating pulls already shown", () => {
    const existing = [completedPull("pull-1"), completedPull("pull-2")];
    const next = appendDashboardProjectPullPage(existing, [
      completedPull("pull-2"),
      completedPull("pull-3"),
    ]);

    expect(next.map((pull) => pull.id)).toEqual(["pull-1", "pull-2", "pull-3"]);
  });
});

describe("dashboardProjectsForReload", () => {
  it("keeps an already loaded project visible during a background refresh", () => {
    const repo = {
      id: "repo-folio",
      fullName: "KMGeon/Folio",
      folioEnabled: true,
      openPrCount: 1,
    };
    const project: DashboardProjectData = {
      repo,
      pages: {
        ready: { items: [], count: 0, nextCursor: null },
        yours: { items: [], count: 0, nextCursor: null },
        other: {
          items: [{ id: "pr-141", title: "Install app", analysisStatus: "processing" }] as never,
          count: 1,
          nextCursor: null,
        },
        completed: { items: [], count: 0, nextCursor: null },
      },
      isLoading: false,
      error: null,
    };

    expect(dashboardProjectsForReload([repo], [project], true)).toEqual([
      { ...project, repo, isLoading: false, error: null },
    ]);
  });
});

function completedPull(id: string) {
  return {
    id,
    org: "KMGeon",
    repo: "Folio",
    number: 1,
    title: "Completed pull",
    author: "reviewer",
    completedAt: "today",
    completedState: "merged" as const,
    githubStatus: "merged" as const,
    analysisStatus: "complete" as const,
    additions: 1,
    deletions: 0,
    changedFiles: 1,
  };
}
