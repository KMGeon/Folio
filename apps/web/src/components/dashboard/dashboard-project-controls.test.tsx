import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DashboardProjectBar } from "./dashboard-project-bar";
import { DashboardProjectSidebar } from "./dashboard-project-sidebar";
import type { DashboardProjectData } from "./dashboard-project-desk-model";

Object.assign(globalThis, { React });

describe("dashboard project controls", () => {
  const projects = [
    project("repo-folio", "KMGeon/Folio", 2),
    project("repo-docs", "KMGeon/docs", 0),
  ];

  it("shows All and each repository with ready-count badges", () => {
    const html = renderToStaticMarkup(
      <DashboardProjectSidebar projects={projects} activeRepoId={null} onSelect={vi.fn()} />,
    );

    expect(html).toContain("All projects");
    expect(html).toContain("enabled");
    expect(html).toContain("KMGeon/Folio");
    expect(html).toContain("KMGeon/docs");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">2</span>");
  });

  it("keeps queue chips inside the active project identity", () => {
    const html = renderToStaticMarkup(
      <DashboardProjectBar
        activeRepo={projects[0]!.repo}
        repoCount={2}
        counts={{ attention: 0, ready: 2, reviewing: 1, processing: 0, complete: 7 }}
        focus="ready"
        onFocusChange={vi.fn()}
      />,
    );

    expect(html).toContain("Folio");
    expect(html).toContain("KMGeon/Folio");
    expect(html).toContain("Folio enabled");
    expect(html).not.toContain("not enabled");
    expect(html).toContain("Ready");
    expect(html).toContain("Reviewing");
    expect(html).toContain("Complete");
    expect(html).toContain('aria-pressed="true"');
  });
});

function project(id: string, fullName: string, ready: number): DashboardProjectData {
  const page = { items: [], nextCursor: null, count: 0 };
  return {
    repo: { id, fullName, folioEnabled: true, openPrCount: 0 },
    pages: {
      ready: {
        ...page,
        count: ready,
        items: Array.from({ length: ready }, (_, index) => ({
          id: `${id}-${index}`,
          analysisStatus: "complete",
          status: "ready",
          viewedChapters: 0,
        })) as never,
      },
      yours: page,
      other: page,
      completed: page,
    },
    isLoading: false,
    error: null,
  };
}
