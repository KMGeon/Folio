import { describe, expect, it } from "vitest";

import { dashboardHeaderStandfirst } from "./dashboard-header";

describe("dashboardHeaderStandfirst", () => {
  it("prioritizes attention before ready queue copy", () => {
    expect(
      dashboardHeaderStandfirst(
        { attention: 2, ready: 3, reviewing: 1, processing: 0, complete: 18 },
        "Folio",
      ),
    ).toContain("확인 필요 2건");
    expect(
      dashboardHeaderStandfirst(
        { attention: 0, ready: 3, reviewing: 1, processing: 0, complete: 18 },
        "Folio",
      ),
    ).toContain("리뷰 3건이 대기");
  });

  it("falls back through reviewing, processing, complete, then default", () => {
    expect(
      dashboardHeaderStandfirst({
        attention: 0,
        ready: 0,
        reviewing: 2,
        processing: 0,
        complete: 5,
      }),
    ).toContain("진행 중인 리뷰 2건");
    expect(
      dashboardHeaderStandfirst({
        attention: 0,
        ready: 0,
        reviewing: 0,
        processing: 4,
        complete: 5,
      }),
    ).toContain("준비 중인 PR 4건");
    expect(
      dashboardHeaderStandfirst({
        attention: 0,
        ready: 0,
        reviewing: 0,
        processing: 0,
        complete: 18,
      }),
    ).toContain("대기 중인 리뷰가 없습니다");
    expect(
      dashboardHeaderStandfirst({
        attention: 0,
        ready: 0,
        reviewing: 0,
        processing: 0,
        complete: 0,
      }),
    ).toContain("챕터 순서로");
  });
});
