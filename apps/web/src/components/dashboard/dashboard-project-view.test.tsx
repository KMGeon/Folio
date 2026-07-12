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
    expect(html).toContain("Next up in Folio");
    expect(html).toContain("Recent complete in Folio");
    expect(html).toContain("docs 큐가 비어 있습니다");
  });

  it("renders only the selected repository as a focused desk", () => {
    const html = render("repo-folio");

    expect(html).toContain('aria-label="Folio review desk"');
    expect(html).toContain("Next up in Folio");
    expect(html).not.toContain("docs 큐가 비어 있습니다");
  });

  it("names All projects when the workspace has no repositories", () => {
    const html = renderToStaticMarkup(
      <DashboardProjectView
        projects={[]}
        activeRepoId={null}
        focus="ready"
        visibleProperties={[]}
        onRetryReview={vi.fn()}
      />,
    );

    expect(html).toContain("All projects 큐가 비어 있습니다");
  });

  function render(activeRepoId: string | null) {
    return renderToStaticMarkup(
      <DashboardProjectView
        projects={[folio, docs]}
        activeRepoId={activeRepoId}
        focus="ready"
        visibleProperties={["Repository", "ID", "Author", "Lines changed", "Chapters"]}
        onRetryReview={vi.fn()}
      />,
    );
  }
});

function project(id: string, fullName: string, populated: boolean): DashboardProjectData {
  const open = populated ? [openPull(fullName)] : [];
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
    viewedChapters: 1,
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
