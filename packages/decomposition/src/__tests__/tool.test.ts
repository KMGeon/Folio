import { describe, expect, it } from "vitest";
import { AgentOutputSchema, parseAgentOutput } from "../schema.js";
import { EMIT_CHAPTERS_TOOL_NAME, emitChaptersTool } from "../tool.js";

describe("emit_chapters tool definition", () => {
  it("is named emit_chapters and forces an object input_schema", () => {
    expect(emitChaptersTool.name).toBe(EMIT_CHAPTERS_TOOL_NAME);
    expect(emitChaptersTool.input_schema.type).toBe("object");
    expect(emitChaptersTool.input_schema.required).toContain("chapters");
  });

  it("requires the strict chapter fields", () => {
    const chapterSchema = emitChaptersTool.input_schema.properties.chapters.items;
    expect(chapterSchema.required).toEqual([
      "id",
      "order",
      "title",
      "summary",
      "hunkRefs",
      "keyChanges",
    ]);
    expect(chapterSchema.additionalProperties).toBe(false);
  });

  it("constrains lineRef side to additions/deletions", () => {
    const lineRef =
      emitChaptersTool.input_schema.properties.chapters.items.properties.keyChanges.items.properties
        .lineRefs.items;
    expect(lineRef.properties.side.enum).toEqual(["additions", "deletions"]);
  });
});

describe("AgentOutput Zod parser", () => {
  it("accepts a valid tool input", () => {
    const valid = {
      chapters: [
        {
          id: "chapter-1",
          order: 1,
          title: "Do the thing",
          summary: "It does the thing.",
          hunkRefs: [{ filePath: "src/a.ts", oldStart: 1 }],
          keyChanges: [],
        },
      ],
    };
    expect(() => parseAgentOutput(valid)).not.toThrow();
    const parsed = AgentOutputSchema.parse(valid);
    expect(parsed.chapters.length).toBe(1);
  });

  it("rejects unknown keys (strict)", () => {
    const bad = {
      chapters: [],
      rogue: true,
    };
    expect(AgentOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects order <= 0", () => {
    const bad = {
      chapters: [{ id: "x", order: 0, title: "t", summary: "s", hunkRefs: [], keyChanges: [] }],
    };
    expect(AgentOutputSchema.safeParse(bad).success).toBe(false);
  });
});
