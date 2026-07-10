import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  dashboardBoardGridClass,
  dashboardCardIdentity,
  dashboardOpenPullCardClass,
  dashboardVisibleCardSections,
} from "./dashboard-board";
import {
  beginDashboardRequest,
  dashboardRequestKey,
  finishDashboardRequest,
  resetDashboardRequestScope,
} from "./dashboard-request-scope";
import { dashboardOpenPullPagesPath, dashboardPullPagePath } from "@/lib/dashboard-api";

describe("DashboardBoardClient", () => {
  it("builds paginated pull URLs with only supported server-backed filters", () => {
    const query = {
      bucket: "ready",
      limit: 20,
      cursor: "cursor-1",
      q: "repo smoke",
      ordering: "lines",
      direction: "asc",
      closedRange: "30d",
      grouping: "repository",
      showDrafts: false,
    } as const;
    const path = dashboardPullPagePath(query);
    const url = new URL(path, "https://folio.test");

    expect(url.pathname).toBe("/api/v1/dashboard/pulls");
    expect(url.searchParams.get("bucket")).toBe("ready");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    expect(url.searchParams.get("q")).toBe("repo smoke");
    expect(url.searchParams.get("ordering")).toBe("lines");
    expect(url.searchParams.get("direction")).toBe("asc");
    expect(url.searchParams.get("closedRange")).toBe("30d");
    expect(url.searchParams.has("grouping")).toBe(false);
    expect(url.searchParams.get("showDrafts")).toBe("false");
  });

  it("builds the combined open pull URL without completed-only fields", () => {
    const query = {
      limit: 20,
      q: "repo smoke",
      ordering: "updated",
      direction: "desc",
      grouping: "responsibility",
      showDrafts: false,
    } as const;
    const path = dashboardOpenPullPagesPath(query);
    const url = new URL(path, "https://folio.test");

    expect(url.pathname).toBe("/api/v1/dashboard/pulls/open");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("q")).toBe("repo smoke");
    expect(url.searchParams.get("showDrafts")).toBe("false");
    expect(url.searchParams.has("bucket")).toBe(false);
    expect(url.searchParams.has("closedRange")).toBe(false);
    expect(url.searchParams.has("grouping")).toBe(false);
  });

  it("keeps newer in-flight request guards when older requests finish", () => {
    const inFlight = new Map<string, symbol>();
    const older = beginDashboardRequest(inFlight, "ready", "reset");
    expect(older).toBeTypeOf("symbol");

    inFlight.clear();
    const newer = beginDashboardRequest(inFlight, "ready", "reset");
    expect(newer).toBeTypeOf("symbol");

    finishDashboardRequest(inFlight, "ready", "reset", older);

    expect(inFlight.get(dashboardRequestKey("ready", "reset"))).toBe(newer);
    finishDashboardRequest(inFlight, "ready", "reset", newer);
    expect(inFlight.has(dashboardRequestKey("ready", "reset"))).toBe(false);
  });

  it("does not invalidate either request scope when the other scope resets", () => {
    const inFlight = new Map<string, symbol>([
      [dashboardRequestKey("open", "reset"), Symbol("open")],
      [dashboardRequestKey("completed", "reset"), Symbol("completed")],
    ]);
    const epochs = { open: 4, completed: 7 };

    const completedEpoch = resetDashboardRequestScope(inFlight, epochs, "completed");

    expect(completedEpoch).toBe(8);
    expect(epochs).toEqual({ open: 4, completed: 8 });
    expect(inFlight.has(dashboardRequestKey("open", "reset"))).toBe(true);
    expect(inFlight.has(dashboardRequestKey("completed", "reset"))).toBe(false);

    inFlight.set(dashboardRequestKey("completed", "reset"), Symbol("new completed"));
    const openEpoch = resetDashboardRequestScope(inFlight, epochs, "open");

    expect(openEpoch).toBe(5);
    expect(epochs).toEqual({ open: 5, completed: 8 });
    expect(inFlight.has(dashboardRequestKey("open", "reset"))).toBe(false);
    expect(inFlight.has(dashboardRequestKey("completed", "reset"))).toBe(true);
  });

  it("applies local layout, highlight, and visible card property rules", () => {
    const sections = dashboardVisibleCardSections(["Repository", "ID"]);

    expect(dashboardBoardGridClass("list")).toBe("grid gap-4");
    expect(dashboardBoardGridClass("board")).toContain("2xl:grid-cols-4");
    expect(dashboardOpenPullCardClass(true)).toContain("border-primary/45");
    expect(dashboardCardIdentity("Folio", 42, ["Repository", "ID"])).toBe("Folio#42");
    expect(sections.author).toBe(false);
    expect(sections.lines).toBe(false);
    expect(sections.updatedDate).toBe(false);
  });

  it("keeps filter panel controls aligned to the board requirements", async () => {
    const source = await readFile(new URL("./dashboard-filter-panel.tsx", import.meta.url), "utf8");
    const boardClient = await readFile(
      new URL("./dashboard-board-client.tsx", import.meta.url),
      "utf8",
    );

    expect(boardClient).toContain('closedRange: "1d"');
    expect(source).toContain("Layout");
    expect(source).toContain("Grouping");
    expect(source).toContain("Ordering");
    expect(source).toContain("Closed reviews");
    expect(source).toContain("Last 24 hours");
    expect(source).toContain("Show drafts");
    expect(source).toContain("Show empty columns");
    expect(source).toContain("Highlight my PRs");
    expect(source).toContain("Display properties");
    expect(source).toContain("aria-pressed");
  });

  it("wires independent open and completed reset effects", async () => {
    const boardClient = await readFile(
      new URL("./dashboard-board-client.tsx", import.meta.url),
      "utf8",
    );

    expect(boardClient).toMatch(
      /resetDashboardRequestScope\([\s\S]*?requestEpochsRef\.current,[\s\S]*?"open"/,
    );
    expect(boardClient).toMatch(
      /resetDashboardRequestScope\([\s\S]*?requestEpochsRef\.current,[\s\S]*?"completed"/,
    );
    expect(boardClient).toContain("void loadOpenBuckets(openEpoch)");
    expect(boardClient).toContain('void loadBucket("completed", "reset", completedEpoch)');
    expect(boardClient).not.toContain("requestVersionRef");
    expect(boardClient).not.toContain("filters.grouping,");
  });
});
