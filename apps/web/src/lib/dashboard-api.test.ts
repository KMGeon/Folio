import { describe, expect, it } from "vitest";

import { dashboardOpenPullPagesPath, dashboardPullPagePath } from "./dashboard-api";

describe("dashboard API paths", () => {
  it("builds paginated pull URLs with exact repository scope", () => {
    const path = dashboardPullPagePath({
      bucket: "ready",
      limit: 20,
      cursor: "cursor-1",
      q: "repo smoke",
      ordering: "lines",
      direction: "asc",
      closedRange: "30d",
      repository: "acme/widget",
      showDrafts: false,
    });
    const url = new URL(path, "https://folio.test");

    expect(url.pathname).toBe("/api/v1/dashboard/pulls");
    expect(url.searchParams.get("bucket")).toBe("ready");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    expect(url.searchParams.get("q")).toBe("repo smoke");
    expect(url.searchParams.get("ordering")).toBe("lines");
    expect(url.searchParams.get("direction")).toBe("asc");
    expect(url.searchParams.get("closedRange")).toBe("30d");
    expect(url.searchParams.get("repository")).toBe("acme/widget");
    expect(url.searchParams.get("showDrafts")).toBe("false");
  });

  it("builds the combined open URL without completed-only fields", () => {
    const path = dashboardOpenPullPagesPath({
      limit: 20,
      q: "repo smoke",
      ordering: "updated",
      direction: "desc",
      repository: "acme/widget",
      showDrafts: false,
    });
    const url = new URL(path, "https://folio.test");

    expect(url.pathname).toBe("/api/v1/dashboard/pulls/open");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("q")).toBe("repo smoke");
    expect(url.searchParams.get("showDrafts")).toBe("false");
    expect(url.searchParams.get("repository")).toBe("acme/widget");
    expect(url.searchParams.has("bucket")).toBe(false);
    expect(url.searchParams.has("closedRange")).toBe(false);
  });
});
