import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DashboardProjectData } from "./dashboard-project-desk-model";
import { DashboardProjectView } from "./dashboard-project-view";

Object.assign(globalThis, { React });

describe("DashboardProjectView", () => {
  const folio = project("repo-folio", "KMGeon/Folio", true);
  const docs = project("repo-docs", "KMGeon/docs", false);

  it("stacks one section per repository in All projects", () => {
    const html = render(null);

    expect(html).toContain('aria-label="All projects review sections"');
    expect(html).toContain("Attention");
    expect(html).toContain("Ready");
    expect(html).toContain("Reviewing");
    expect(html).toContain("Processing");
    expect(html).toContain("Complete");
    expect(html).toContain("Start review");
    expect(html).toContain("Project queue is clear");
    expect(html).not.toContain("Recent complete in Folio");
  });

  it("renders only the selected repository as a focused desk", () => {
    const html = render("repo-folio");

    expect(html).toContain('aria-label="Folio review desk"');
    expect(html).toContain("Start review");
    expect(html).not.toContain("Project queue is clear");
  });

  it("uses state-specific actions for each open cockpit panel", () => {
    expect(render("repo-folio", "attention")).toContain("Retry analysis");
    expect(render("repo-folio", "ready")).toContain("Start review");
    expect(render("repo-folio", "reviewing")).toContain("Continue");
    expect(render("repo-folio", "processing")).toContain("Preparing");
    expect(render("repo-folio", "complete")).toContain("Completed Folio");
  });

  it("renders the dedicated no-enabled-repos panel when the list is empty", () => {
    const html = renderToStaticMarkup(
      <DashboardProjectView
        projects={[]}
        activeRepoId={null}
        focus="ready"
        onFocusChange={vi.fn()}
        visibleProperties={[]}
        onRetryReview={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="No enabled repositories"');
    expect(html).toContain("활성화된 레포가 없습니다");
  });

  function render(
    activeRepoId: string | null,
    focus: "attention" | "ready" | "reviewing" | "processing" | "complete" = "ready",
  ) {
    return renderToStaticMarkup(
      <DashboardProjectView
        projects={[folio, docs]}
        activeRepoId={activeRepoId}
        focus={focus}
        onFocusChange={vi.fn()}
        visibleProperties={["Repository", "ID", "Author", "Lines changed", "Chapters"]}
        onRetryReview={vi.fn()}
      />,
    );
  }
});

function project(id: string, fullName: string, populated: boolean): DashboardProjectData {
  const open = populated
    ? [
        openPull(fullName),
        { ...openPull(fullName), id: `${fullName}-attention`, analysisStatus: "failed" as const },
        { ...openPull(fullName), id: `${fullName}-reviewing`, viewedChapters: 1 },
        {
          ...openPull(fullName),
          id: `${fullName}-processing`,
          analysisStatus: "processing" as const,
          status: "processing" as const,
        },
      ]
    : [];
  const completed = populated ? [completedPull(fullName)] : [];
  return {
    repo: { id, fullName, folioEnabled: true, openPrCount: open.length },
    pages: {
      ready: { items: open, nextCursor: null, count: open.length },
      yours: { items: [], nextCursor: null, count: 0 },
      other: { items: [], nextCursor: null, count: 0 },
      completed: { items: completed, nextCursor: null, count: completed.length },
    },
    isLoading: false,
    error: null,
  };
}

function openPull(fullName: string) {
  const [org = "unknown", repo = fullName] = fullName.split("/");
  return {
    id: `${fullName}-1`,
    org,
    repo,
    number: 1,
    title: `Review ${repo}`,
    author: "reviewer",
    updatedAt: "now",
    updatedAtIso: "2026-07-12T00:00:00.000Z",
    headBranch: "feature",
    headSha: "sha",
    baseBranch: "main",
    githubStatus: "open",
    analysisStatus: "complete",
    completedAt: null,
    status: "ready",
    chapterCount: 4,
    viewedChapters: 0,
    changedFiles: 2,
    additions: 10,
    deletions: 2,
    risk: "low",
  } as const;
}

function completedPull(fullName: string) {
  const [org = "unknown", repo = fullName] = fullName.split("/");
  return {
    id: `${fullName}-2`,
    org,
    repo,
    number: 2,
    title: `Completed ${repo}`,
    author: "reviewer",
    completedAt: "today",
    completedState: "merged",
    githubStatus: "merged",
    analysisStatus: "complete",
    additions: 5,
    deletions: 1,
    changedFiles: 1,
  } as const;
}
