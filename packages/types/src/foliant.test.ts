import { describe, expect, it } from "vitest";
import { CitationSchema, FoliantStreamEventSchema } from "./foliant.js";

describe("CitationSchema", () => {
  it("accepts a valid citation", () => {
    const c = { file: "a.ts", startLine: 1, endLine: 10 };
    expect(CitationSchema.parse(c)).toEqual(c);
  });

  it("rejects non-positive lines", () => {
    expect(CitationSchema.safeParse({ file: "a.ts", startLine: 0, endLine: 5 }).success).toBe(
      false,
    );
  });
});

describe("FoliantStreamEventSchema", () => {
  it("parses a token event", () => {
    const ev = FoliantStreamEventSchema.parse({ type: "token", text: "hi" });
    if (ev.type === "token") {
      expect(ev.text).toBe("hi");
    } else {
      throw new Error("expected token");
    }
  });

  it("parses a citation event", () => {
    const ev = FoliantStreamEventSchema.parse({
      type: "citation",
      citation: { file: "a.ts", startLine: 1, endLine: 2 },
    });
    expect(ev.type).toBe("citation");
  });

  it("parses a done event", () => {
    expect(FoliantStreamEventSchema.parse({ type: "done" }).type).toBe("done");
  });

  it("rejects an unknown event type", () => {
    expect(FoliantStreamEventSchema.safeParse({ type: "boom" }).success).toBe(false);
  });
});
