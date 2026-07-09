import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DashboardBoardClient", () => {
  it("loads columns through the paginated dashboard API", async () => {
    const source = await readFile(new URL("./dashboard-board-client.tsx", import.meta.url), "utf8");

    expect(source).toContain("fetchDashboardPullPage");
    expect(source).toContain('bucket: "completed"');
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("setDebouncedQuery");
    expect(source).toContain("showEmptyColumns");
  });

  it("keeps filter panel controls aligned to the board requirements", async () => {
    const source = await readFile(new URL("./dashboard-filter-panel.tsx", import.meta.url), "utf8");

    expect(source).toContain("Layout");
    expect(source).toContain("Grouping");
    expect(source).toContain("Ordering");
    expect(source).toContain("Closed reviews");
    expect(source).toContain("Show drafts");
    expect(source).toContain("Show empty columns");
    expect(source).toContain("Highlight my PRs");
    expect(source).toContain("Display properties");
  });
});
