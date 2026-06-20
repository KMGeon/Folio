import { filterFilesForLlm, parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import { ChapterSchema, PrologueSchema } from "@folio/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../config.js";
import { decompose, decomposeDeterministic } from "../decompose.js";
import { StubClient, fullCoverageChapter, readFixture } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function expectFullCoverage(diff: string, chapters: unknown): void {
  const allFiles = parseUnifiedDiff(diff);
  expect(() => validateHunkCoverage(allFiles, chapters as never)).not.toThrow();
}

describe("decompose — LLM happy path (mocked Codex)", () => {
  it("returns source 'llm' with full coverage from a valid stubbed tool input", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    const stub = new StubClient([
      {
        chapters: [fullCoverageChapter(diff)],
        prologue: {
          motivation: "Refactor for clarity.",
          outcome: "add() lives in its own module now.",
          diagram: null,
          keyChanges: [
            {
              summary: "add() moved to its own module",
              description: "Extracted from util.ts into math/add.ts.",
            },
            {
              summary: "Barrel re-export updated",
              description: "index.ts now points add() at the new module.",
            },
          ],
          focusAreas: [
            {
              type: "architecture",
              severity: "info",
              title: "Module split",
              description: "Verify the barrel still re-exports every symbol consumers import.",
              locations: ["src/index.ts"],
            },
          ],
          complexity: { level: "low", reasoning: "Mechanical move plus a test." },
        },
      },
    ]);

    const result = await decompose(
      { diff },
      {},
      {
        clientFactory: (_c: ResolvedConfig) => stub,
      },
    );

    expect(result.source).toBe("llm");
    expect(result.modelUsed).toBe("stub-model");
    expect(result.chapters.length).toBeGreaterThan(0);
    for (const chapter of result.chapters) {
      ChapterSchema.parse(chapter);
    }
    expect(result.prologue).not.toBeNull();
    PrologueSchema.parse(result.prologue);
    expectFullCoverage(diff, result.chapters);
    expect(stub.requests.length).toBe(1);
  });

  it("falls back to a deterministic prologue when the tool omits one", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    const stub = new StubClient([{ chapters: [fullCoverageChapter(diff)] }]);
    const result = await decompose(
      { diff, prTitle: "Refactor add()" },
      {},
      {
        clientFactory: () => stub,
      },
    );
    expect(result.source).toBe("llm");
    expect(result.prologue).not.toBeNull();
    PrologueSchema.parse(result.prologue);
  });
});

describe("decompose — tiny PR + llm-off short-circuits", () => {
  it("produces a single chapter for a tiny PR (<= threshold)", async () => {
    const diff = readFixture("tiny-pr.diff");
    const spy = vi.fn();
    const result = await decompose(
      { diff },
      {},
      {
        clientFactory: () => {
          spy();
          return new StubClient([]);
        },
      },
    );
    // Tiny PR never calls the LLM.
    expect(spy).not.toHaveBeenCalled();
    expect(result.source).toBe("fallback");
    expect(result.chapters.length).toBe(1);
    expectFullCoverage(diff, result.chapters);
  });

  it("uses fallback when FOLIO_DECOMP_LLM=0 and no client factory given", async () => {
    const original = process.env.FOLIO_DECOMP_LLM;
    process.env.FOLIO_DECOMP_LLM = "0";
    try {
      const diff = readFixture("refactor-with-tests.diff");
      const result = await decompose({ diff });
      expect(result.source).toBe("fallback");
      expect(result.modelUsed).toBe("");
      expectFullCoverage(diff, result.chapters);
    } finally {
      if (original === undefined) {
        delete process.env.FOLIO_DECOMP_LLM;
      } else {
        process.env.FOLIO_DECOMP_LLM = original;
      }
    }
  });
});

describe("decomposeDeterministic", () => {
  it("groups a multi-directory PR and covers every hunk", () => {
    const diff = readFixture("multi-dir.diff");
    const result = decomposeDeterministic({ diff });
    expect(result.source).toBe("fallback");
    expect(result.chapters.length).toBeGreaterThan(1);
    expectFullCoverage(diff, result.chapters);
  });

  it("routes excluded lockfile hunks into an Other changes chapter", () => {
    const diff = readFixture("with-lockfile.diff");
    const result = decomposeDeterministic({ diff });
    const other = result.chapters.find((c) => c.title === "Other changes");
    expect(other).toBeDefined();
    expect(other?.hunkRefs.some((r) => r.filePath === "pnpm-lock.yaml")).toBe(true);
    // Reviewable files were not excluded.
    const { files: reviewable } = filterFilesForLlm(parseUnifiedDiff(diff));
    expect(reviewable.some((f) => f.path === "src/server.ts")).toBe(true);
    expectFullCoverage(diff, result.chapters);
  });

  it("returns a valid empty-ish result for an empty diff", () => {
    const result = decomposeDeterministic({ diff: "" });
    expect(result.chapters.length).toBe(0);
    expect(result.prologue).not.toBeNull();
    PrologueSchema.parse(result.prologue);
  });
});
