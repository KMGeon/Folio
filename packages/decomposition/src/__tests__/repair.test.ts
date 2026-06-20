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

  it("falls back (no throw) when repair attempts are exhausted", async () => {
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
    // First call + 2 repair attempts all bad → fallback.
    const stub = new StubClient([bad, bad, bad]);

    const result = await decompose(
      { diff },
      { maxRepairAttempts: 2 },
      {
        clientFactory: () => stub,
      },
    );

    expect(result.source).toBe("fallback");
    expect(result.modelUsed).toBe("");
    expect(stub.requests.length).toBe(3);
    expectFullCoverage(diff, result.chapters);
  });

  it("falls back when the model throws a transport error", async () => {
    const diff = readFixture("refactor-with-tests.diff");
    const stub = new StubClient([new Error("503 overloaded")]);
    const result = await decompose({ diff }, {}, { clientFactory: () => stub });
    expect(result.source).toBe("fallback");
    expectFullCoverage(diff, result.chapters);
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
