import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "review-view.tsx"), "utf8");
const chapterPanelSource = readFileSync(resolve(__dirname, "chapter-panel.tsx"), "utf8");

describe("ReviewView source", () => {
  it("keeps file diffs expanded until collapse all is clicked", () => {
    expect(source).toContain("useState<number | undefined>()");
    expect(source).toContain("(v ?? 0) + 1");
  });

  it("can open directly to a chapter route", () => {
    expect(source).toContain("initialChapterIndex");
    expect(source).toContain("useState<number | null>(initialChapterIndex ?? null)");
    expect(source).toContain("setOpenIndex(initialChapterIndex ?? null)");
  });

  it("keeps the chapter panel wide enough for review questions", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_460px]");
    expect(chapterPanelSource).toContain("lg:w-[460px]");
    expect(chapterPanelSource).toContain("px-3.5 py-3");
    expect(chapterPanelSource).toContain("leading-relaxed");
  });
});
