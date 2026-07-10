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

  it("resets source changes before a new render while retaining cancellation", () => {
    const loadingReset = source.indexOf('setState({ kind: "loading" })');
    const importStart = source.indexOf('await import("mermaid")');

    expect(loadingReset).toBeGreaterThan(-1);
    expect(loadingReset).toBeLessThan(importStart);
    expect(source).toContain("let active = true");
    expect(source).toContain("if (active)");
    expect(source).toContain("active = false");
  });
});
