import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "review-view.tsx"), "utf8");
const chapterPanelSource = readFileSync(resolve(__dirname, "chapter-panel.tsx"), "utf8");
const changedFileTreeSource = readFileSync(resolve(__dirname, "changed-file-tree.tsx"), "utf8");
const chapterCardsSource = readFileSync(resolve(__dirname, "chapter-cards.tsx"), "utf8");
const topBarSource = readFileSync(resolve(__dirname, "review-top-bar.tsx"), "utf8");

describe("ReviewView source", () => {
  it("matches the compact review density reference", () => {
    expect(chapterCardsSource).toContain("gap-3 border-b p-3");
    expect(chapterCardsSource).toContain("font-serif text-sm");
    expect(chapterCardsSource).toContain("font-mono text-xs");
    expect(topBarSource).toContain("font-serif text-2xl");
  });

  it("can collapse and expand every file from the chapter toolbar", () => {
    expect(source).toContain("allOpenChapterFilesCollapsed");
    expect(source).toContain('"모두 펴기" : "모두 접기"');
    expect(source).toContain("toggleAllOpenChapterFiles");
  });

  it("owns one diff view mode for all file panels", () => {
    expect(source).toContain('useState<DiffViewMode>("split")');
    expect(source).toContain("viewMode={diffViewMode}");
  });

  it("can open directly to a chapter route", () => {
    expect(source).toContain("initialChapterIndex");
    expect(source).toContain("useState<number | null>(initialChapterIndex ?? null)");
    expect(source).toContain("setOpenIndex(initialChapterIndex ?? null)");
  });

  it("forwards the optional generated prologue from both routes", () => {
    const overviewSource = readFileSync(
      resolve(__dirname, "../../app/[org]/[repo]/pull/[number]/page.tsx"),
      "utf8",
    );
    const chapterSource = readFileSync(
      resolve(__dirname, "../../app/[org]/[repo]/pull/[number]/chapters/[index]/page.tsx"),
      "utf8",
    );

    expect(overviewSource).toContain("prologue={review.prologue}");
    expect(chapterSource).toContain("prologue={review.prologue}");
    expect(source).toContain("prologue: Prologue | null");
    expect(source).toContain("<ReviewPrologue pr={pr} prologue={prologue}");
  });

  it("allows both overview grid columns to shrink on narrow screens", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]");
    expect(source).toContain('<section className="min-w-0">\n                <ReviewPrologue');
    expect(source).toContain('<section className="min-w-0">\n                <div className="mb-3');
  });

  it("keeps the chapter panel wide enough for review questions", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_460px]");
    expect(chapterPanelSource).toContain("lg:w-[460px]");
    expect(chapterPanelSource).toContain("px-3 py-2.5");
    expect(chapterPanelSource).toContain("leading-5");
  });

  it("keeps the files tab file list independently scrollable", () => {
    expect(source).toContain(
      "flex min-h-72 flex-col overflow-hidden border-b bg-card/35 lg:min-h-0 lg:border-r lg:border-b-0",
    );
    expect(changedFileTreeSource).toContain("min-h-0 flex-1 overflow-y-auto p-3");
  });
});
