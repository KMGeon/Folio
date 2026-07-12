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
import { columnLoadingStateForReset, hasActiveReviewJobs } from "./dashboard-board-stream";

describe("DashboardBoardClient", () => {
  it("polls only while a visible review job is active", () => {
    const columns = {
      ready: { items: [{ analysisStatus: "processing" }] },
      yours: { items: [] },
      other: { items: [] },
      completed: { items: [] },
    };
    expect(hasActiveReviewJobs(columns as never)).toBe(true);
    columns.ready.items[0]!.analysisStatus = "complete";
    expect(hasActiveReviewJobs(columns as never)).toBe(false);
  });

  it("keeps cards visible on soft reset and wipes only on hard reset", () => {
    const loaded = {
      items: [{ id: "pr-1" }],
      count: 1,
      nextCursor: null,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
    };

    expect(columnLoadingStateForReset(loaded as never, true)).toEqual({
      items: loaded.items,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
    });
    expect(columnLoadingStateForReset(loaded as never, false)).toEqual({
      items: [],
      isInitialLoading: true,
      isLoadingMore: false,
      error: null,
    });
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

    expect(boardClient).toContain("DashboardDesk");
    expect(boardClient).toContain("initialDashboardFilters");
    const config = await readFile(new URL("./dashboard-board-config.ts", import.meta.url), "utf8");
    expect(config).toContain('closedRange: "1d"');
    expect(config).toContain('grouping: "repository"');
    expect(source).not.toContain('label="Layout"');
    expect(source).not.toContain('label="Grouping"');
    expect(source).toContain("Ordering");
    expect(source).toContain("Closed reviews");
    expect(source).toContain("Last 24 hours");
    expect(source).toContain("Show drafts");
    expect(source).not.toContain("Show empty columns");
    expect(source).not.toContain("Highlight my PRs");
    expect(source).toContain("Display properties");
    expect(source).toContain("aria-pressed");
    expect(source).not.toContain('<option value="responsibility">');
  });

  it("stages dashboard filters in an anchored, accessible menu", async () => {
    const panel = await readFile(new URL("./dashboard-filter-panel.tsx", import.meta.url), "utf8");
    const searchBar = await readFile(
      new URL("./dashboard-search-bar.tsx", import.meta.url),
      "utf8",
    );
    const desk = await readFile(new URL("./dashboard-desk.tsx", import.meta.url), "utf8");
    const boardClient = await readFile(
      new URL("./dashboard-board-client.tsx", import.meta.url),
      "utf8",
    );

    expect(panel).toContain("draftFilters");
    expect(panel).toContain("onSave(draftFilters)");
    expect(panel).toContain('id="dashboard-filter-menu"');
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-label="Filters and ordering"');
    expect(panel).toContain("Save changes");
    expect(panel).toContain("Cancel");
    expect(panel).toContain('event.key === "Escape"');
    expect(panel).toContain('document.addEventListener("pointerdown"');
    expect(panel).toContain("triggerRef.current?.focus()");
    expect(panel).toContain("w-[min(22rem,calc(100vw-2rem))]");
    expect(searchBar).toContain("aria-expanded={filterOpen}");
    expect(searchBar).toContain('aria-controls="dashboard-filter-menu"');
    expect(searchBar).toContain("ref={filterTriggerRef}");
    expect(desk).toContain("relative");
    expect(desk).toContain("filterTriggerRef");
    expect(boardClient).toContain("useRef<HTMLButtonElement | null>(null)");
    expect(boardClient).toContain("onFiltersSave={setFilters}");
  });

  it("uses cockpit priority until a user selects a desk state", async () => {
    const boardClient = await readFile(
      new URL("./dashboard-board-client.tsx", import.meta.url),
      "utf8",
    );

    expect(boardClient).toContain("dashboardDefaultFocus(headerCounts)");
    expect(boardClient).toContain("focusIsUserSelected");
    expect(boardClient).toContain("setFocusIsUserSelected(true)");
    expect(boardClient).toContain("setFocusIsUserSelected(false)");
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
    // Active-job poll must soft-refresh so the board does not blink every 3s.
    expect(boardClient).toContain("void loadOpenBuckets(openEpoch, { soft: true })");
    expect(boardClient).toContain(
      'void loadBucket("completed", "reset", completedEpoch, { soft: true })',
    );
    expect(boardClient).not.toContain("requestVersionRef");
    expect(boardClient).not.toContain("filters.grouping,");
  });

  it("soft-reloads open buckets on SSE events and only after reconnect", async () => {
    const stream = await readFile(new URL("./dashboard-board-stream.ts", import.meta.url), "utf8");

    expect(stream).toContain("void input.loadOpenBuckets(openEpoch, { soft: true })");
    expect(stream).toContain("input.onRefresh?.();");
    expect(stream).toContain("let hasOpened = false");
    expect(stream).toContain("if (!hasOpened)");
    expect(stream).toContain("hasOpened = true");
    // First connect must not force a reload; only reconnect does.
    expect(stream).toMatch(/source\.onopen = \(\) => \{[\s\S]*?if \(!hasOpened\)/);
  });
});
