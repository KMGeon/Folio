import { parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import type { ChapterEmit } from "@folio/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fitsInOneChunk, mergeChunkChapters, splitIntoChunks } from "../chunking.js";
import { decompose } from "../decompose.js";
import { StubClient, readFixture } from "./helpers.js";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
});

describe("splitIntoChunks", () => {
  it("keeps a small diff in one chunk", () => {
    const files = parseUnifiedDiff(readFixture("multi-dir.diff"));
    expect(fitsInOneChunk(files, 1_000_000)).toBe(true);
    expect(splitIntoChunks(files, 1_000_000).length).toBe(1);
  });

  it("splits into multiple chunks under a tiny char budget without splitting a file", () => {
    const files = parseUnifiedDiff(readFixture("multi-dir.diff"));
    const chunks = splitIntoChunks(files, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // No file appears in two chunks.
    const seen = new Set<string>();
    for (const chunk of chunks) {
      for (const f of chunk.files) {
        expect(seen.has(f.path)).toBe(false);
        seen.add(f.path);
      }
    }
    // Every file is placed somewhere.
    expect(seen.size).toBe(files.length);
  });

  it("returns [] for no files", () => {
    expect(splitIntoChunks([], 100)).toEqual([]);
  });
});

describe("mergeChunkChapters", () => {
  it("concatenates per-chunk chapters and renumbers order 1..N", () => {
    const a: ChapterEmit[] = [
      { id: "c1", order: 1, title: "A", summary: "a", hunkRefs: [], keyChanges: [] },
    ];
    const b: ChapterEmit[] = [
      { id: "cX", order: 5, title: "B", summary: "b", hunkRefs: [], keyChanges: [] },
      { id: "cY", order: 9, title: "C", summary: "c", hunkRefs: [], keyChanges: [] },
    ];
    const merged = mergeChunkChapters([a, b]);
    expect(merged.map((c) => c.order)).toEqual([1, 2, 3]);
    expect(merged.map((c) => c.id)).toEqual(["chapter-1", "chapter-2", "chapter-3"]);
    expect(merged.map((c) => c.title)).toEqual(["A", "B", "C"]);
  });
});

describe("chunked decompose end-to-end (mocked Anthropic)", () => {
  it("proposes per chunk, merges, and keeps full coverage with contiguous order", async () => {
    const diff = readFixture("multi-dir.diff");
    const files = parseUnifiedDiff(diff);

    // Force chunking with a tiny maxDiffChars. Each per-chunk response covers
    // exactly that chunk's files. The final merged set must cover everything.
    const stub = new StubClient([], "stub-model");
    // Replace emitChapters with one that covers the files named in the prompt.
    const original = stub.emitChapters.bind(stub);
    stub.emitChapters = async (req) => {
      await original(req).catch(() => undefined); // record request
      const prompt = req.messages.map((m) => m.content).join("\n");
      const chapterFiles = files.filter((f) => prompt.includes(`filePath: "${f.path}"`));
      const hunkRefs = chapterFiles.flatMap((f) =>
        f.hunks.map((h) => ({ filePath: f.path, oldStart: h.oldStart })),
      );
      return {
        chapters: [
          {
            id: "chapter-1",
            order: 1,
            title: "Chunk changes",
            summary: "Covers this chunk's files.",
            hunkRefs,
            keyChanges: [],
          },
        ],
      };
    };

    const result = await decompose(
      { diff },
      { maxDiffChars: 60 },
      {
        clientFactory: () => stub,
      },
    );

    // More than one chunk → more than one underlying call.
    expect(stub.requests.length).toBeGreaterThan(1);
    expect(() => validateHunkCoverage(files, result.chapters)).not.toThrow();
    // Final wire orders are unique LexoRanks.
    const orders = new Set(result.chapters.map((c) => c.order));
    expect(orders.size).toBe(result.chapters.length);
  });
});
