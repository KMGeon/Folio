import { describe, expect, it } from "vitest";

import { dashboardHeaderStandfirst } from "./dashboard-header";

describe("dashboardHeaderStandfirst", () => {
  it("prioritizes ready queue copy", () => {
    expect(dashboardHeaderStandfirst({ ready: 3, yours: 1, completed: 18 }, "Folio")).toContain(
      "리뷰 3건이 대기",
    );
    expect(dashboardHeaderStandfirst({ ready: 3, yours: 1, completed: 18 }, "Folio")).toContain(
      "Folio",
    );
  });

  it("falls back to yours, then completed, then default", () => {
    expect(dashboardHeaderStandfirst({ ready: 0, yours: 2, completed: 5 })).toContain(
      "열린 PR 2건",
    );
    expect(dashboardHeaderStandfirst({ ready: 0, yours: 0, completed: 18 })).toContain(
      "대기 중인 리뷰가 없습니다",
    );
    expect(dashboardHeaderStandfirst({ ready: 0, yours: 0, completed: 0 })).toContain(
      "챕터 순서로",
    );
  });
});
