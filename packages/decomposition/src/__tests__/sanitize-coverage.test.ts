import type { ChapterEmit, PullRequestFile } from "@folio/types";
import { describe, expect, it } from "vitest";
import { sanitizeChapters } from "../sanitize-coverage.js";

// Two files, each one hunk at oldStart 1 and 5.
const files: PullRequestFile[] = [
  { path: "a.ts", status: "modified", hunks: [{ oldStart: 1 }, { oldStart: 5 }] },
] as unknown as PullRequestFile[];

function ch(order: number, refs: { filePath: string; oldStart: number }[]): ChapterEmit {
  return {
    id: `chapter-${order}`,
    order,
    title: `c${order}`,
    summary: "s",
    hunkRefs: refs,
    keyChanges: [],
  };
}

describe("sanitizeChapters", () => {
  it("drops hunkRefs that do not exist in the diff (extra)", () => {
    const out = sanitizeChapters(
      [
        ch(1, [
          { filePath: "a.ts", oldStart: 1 },
          { filePath: "a.ts", oldStart: 99 },
        ]),
      ],
      files,
    );
    const all = out.flatMap((c) => c.hunkRefs);
    expect(all).not.toContainEqual({ filePath: "a.ts", oldStart: 99 });
    expect(all).toContainEqual({ filePath: "a.ts", oldStart: 1 });
  });

  it("keeps a duplicated hunk in the first chapter only", () => {
    const out = sanitizeChapters(
      [
        ch(1, [{ filePath: "a.ts", oldStart: 1 }]),
        ch(2, [
          { filePath: "a.ts", oldStart: 1 },
          { filePath: "a.ts", oldStart: 5 },
        ]),
      ],
      files,
    );
    const c1 = out.find((c) => c.title === "c1");
    const c2 = out.find((c) => c.title === "c2");
    expect(c1?.hunkRefs).toContainEqual({ filePath: "a.ts", oldStart: 1 });
    expect(c2?.hunkRefs).not.toContainEqual({ filePath: "a.ts", oldStart: 1 });
    expect(c2?.hunkRefs).toContainEqual({ filePath: "a.ts", oldStart: 5 });
  });

  it("drops a chapter that becomes empty and renumbers order", () => {
    const out = sanitizeChapters(
      [ch(1, [{ filePath: "a.ts", oldStart: 99 }]), ch(2, [{ filePath: "a.ts", oldStart: 1 }])],
      files,
    );
    expect(out.some((c) => c.title === "c1")).toBe(false);
    expect(out[0]?.order).toBe(1);
  });

  it("sweeps unassigned hunks into a leftover chapter (full coverage)", () => {
    const out = sanitizeChapters([ch(1, [{ filePath: "a.ts", oldStart: 1 }])], files);
    const all = out.flatMap((c) => c.hunkRefs);
    expect(all).toContainEqual({ filePath: "a.ts", oldStart: 1 });
    expect(all).toContainEqual({ filePath: "a.ts", oldStart: 5 });
  });
});
