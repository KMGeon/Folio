import { parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import { describe, expect, it } from "vitest";
import { decompose } from "../decompose.js";
import { StubClient, fullCoverageChapter, readFixture } from "./helpers.js";

function expectFullCoverage(diff: string, chapters: unknown): void {
  const files = parseUnifiedDiff(diff);
  expect(() => validateHunkCoverage(files, chapters as never)).not.toThrow();
}

describe("repair loop (mocked Codex)", () => {
  it("marks source 'llm-repaired' when the first output fails coverage and the second is valid", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    // First response: a chapter missing several hunks → coverage failure.
    const bad = {
      chapters: [
        {
          id: "chapter-1",
          order: 1,
          title: "Partial",
          summary: "Only covers one hunk.",
          hunkRefs: [{ filePath: "src/index.ts", oldStart: 1 }],
          keyChanges: [],
        },
      ],
    };
    const good = { chapters: [fullCoverageChapter(diff)] };
    const stub = new StubClient([bad, good]);

    const result = await decompose({ diff }, {}, { clientFactory: () => stub });

    expect(result.source).toBe("llm-repaired");
    expect(stub.requests.length).toBe(2);
    // The repair request carries the missing-hunk feedback.
    const repairMsg = stub.requests[1]?.messages.at(-1)?.content ?? "";
    expect(repairMsg).toContain("MISSING");
    expectFullCoverage(diff, result.chapters);
  });

  it("keeps best-effort LLM output (llm-repaired) when repair exhausts on a schema-valid-but-uncovered output", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    const bad = {
      chapters: [
        {
          id: "chapter-1",
          order: 1,
          title: "Partial",
          summary: "Always missing hunks.",
          hunkRefs: [{ filePath: "src/index.ts", oldStart: 1 }],
          keyChanges: [],
        },
      ],
    };
    // First call + 2 repair attempts all bad → graceful best-effort return.
    const stub = new StubClient([bad, bad, bad]);

    const result = await decompose(
      { diff },
      { maxRepairAttempts: 2 },
      {
        clientFactory: () => stub,
      },
    );

    expect(result.source).toBe("llm-repaired");
    expect(stub.requests.length).toBe(3);
    // The LLM-authored chapter survived (not replaced by deterministic fallback).
    expect(result.chapters.some((c) => c.title === "Partial")).toBe(true);
    // Coverage sanitizer fills the gaps so the result is still fully covered.
    expectFullCoverage(diff, result.chapters);
  });

  it("propagates model transport errors", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    const stub = new StubClient([new Error("503 overloaded")]);
    await expect(decompose({ diff }, {}, { clientFactory: () => stub })).rejects.toThrow(
      "503 overloaded",
    );
  });

  it("repairs a schema-invalid first output", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    const invalid = {
      chapters: [{ id: "x", order: 0, title: "", summary: "", hunkRefs: [], keyChanges: [] }],
    };
    const good = { chapters: [fullCoverageChapter(diff)] };
    const stub = new StubClient([invalid, good]);
    const result = await decompose({ diff }, {}, { clientFactory: () => stub });
    expect(result.source).toBe("llm-repaired");
    const repairMsg = stub.requests[1]?.messages.at(-1)?.content ?? "";
    expect(repairMsg).toContain("schema");
    expectFullCoverage(diff, result.chapters);
  });
});
