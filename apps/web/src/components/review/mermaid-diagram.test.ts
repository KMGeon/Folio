import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { mermaidSourceError } from "./mermaid-diagram.js";

const source = readFileSync(resolve(__dirname, "mermaid-diagram.tsx"), "utf8");

describe("MermaidDiagram", () => {
  it("guards input", () => {
    expect(mermaidSourceError("flowchart LR\nA-->B")).toBeNull();
    expect(mermaidSourceError("   ")).toBe("empty");
    expect(mermaidSourceError("x".repeat(20_001))).toBe("too-large");
  });

  it("uses strict lazy rendering and catches failures", () => {
    expect(source).toContain('securityLevel: "strict"');
    expect(source).toContain("startOnLoad: false");
    expect(source).toContain('await import("mermaid")');
    expect(source).toContain("catch");
  });
});
