import { describe, expect, it } from "vitest";

import { dashboardScopeForRepository } from "./dashboard-repository-scope.js";

describe("dashboardScopeForRepository", () => {
  const scope = {
    workspace: { id: "workspace-1", githubAccountId: 1 },
    installations: [],
    repositories: [
      { id: "folio", fullName: "KMGeon/Folio" },
      { id: "folio-docs", fullName: "KMGeon/Folio-docs" },
    ],
  } as never;

  it("keeps only the exact case-insensitive repository name", () => {
    const selected = dashboardScopeForRepository(scope, "kmgeon/FOLIO");

    expect(selected?.repositories.map((repo) => repo.id)).toEqual(["folio"]);
  });

  it("preserves the authorized workspace when no project is selected", () => {
    expect(dashboardScopeForRepository(scope, undefined)).toBe(scope);
    expect(dashboardScopeForRepository(null, "KMGeon/Folio")).toBeNull();
  });
});
