import { describe, expect, it } from "vitest";

import { selectEnabledDashboardRepos } from "./use-dashboard-projects";

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
});
