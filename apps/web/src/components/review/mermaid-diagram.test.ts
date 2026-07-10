// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mermaidHarness = vi.hoisted(() => {
  const renders: {
    source: string;
    resolve: (value: { svg: string }) => void;
    reject: (reason?: unknown) => void;
  }[] = [];
  return {
    mermaid: {
      initialize: vi.fn(),
      render: vi.fn(
        (_: string, source: string) =>
          new Promise<{ svg: string }>((resolve, reject) => {
            renders.push({ source, resolve, reject });
          }),
      ),
    },
    renders,
  };
});

vi.mock("mermaid", () => ({ default: mermaidHarness.mermaid }));

import { MermaidDiagram, mermaidSourceError } from "./mermaid-diagram.js";

const source = readFileSync(resolve(__dirname, "mermaid-diagram.tsx"), "utf8");
const mountedRoots: Root[] = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
  });
  mermaidHarness.renders.length = 0;
  vi.clearAllMocks();
});

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

  it("hides a ready SVG while replacement source renders", async () => {
    const { container, root } = await mountDiagram("flowchart LR\\nA-->B");
    await resolveRender(0, "<svg><text>first</text></svg>");
    expect(container.textContent).toContain("first");

    await renderDiagram(root, "flowchart LR\\nB-->C");

    expect(container.textContent).not.toContain("first");
    expect(container.querySelector("[aria-busy]")).not.toBeNull();
  });

  it("does not let a cancelled render overwrite its replacement", async () => {
    const { container, root } = await mountDiagram("flowchart LR\\nA-->B");
    await renderDiagram(root, "flowchart LR\\nB-->C");
    await resolveRender(0, "<svg><text>old</text></svg>");

    expect(container.textContent).not.toContain("old");
    expect(container.querySelector("[aria-busy]")).not.toBeNull();

    await resolveRender(1, "<svg><text>new</text></svg>");
    expect(container.textContent).toContain("new");
    expect(container.textContent).not.toContain("old");
  });

  it("shows a localized error when replacement rendering fails", async () => {
    const { container, root } = await mountDiagram("flowchart LR\\nA-->B");
    await resolveRender(0, "<svg><text>first</text></svg>");
    await renderDiagram(root, "flowchart LR\\nB-->C");
    await rejectRender(1);

    expect(container.textContent).toContain("흐름도를 표시할 수 없습니다.");
    expect(container.textContent).not.toContain("first");
    expect(container.querySelector("[aria-busy]")).toBeNull();
  });
});

async function mountDiagram(source: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await renderDiagram(root, source);
  return { container, root };
}

async function renderDiagram(root: Root, source: string) {
  await act(async () => {
    root.render(React.createElement(MermaidDiagram, { source, label: "diagram" }));
    await flushPromises();
  });
}

async function resolveRender(index: number, svg: string) {
  await act(async () => {
    mermaidHarness.renders[index]?.resolve({ svg });
    await flushPromises();
  });
}

async function rejectRender(index: number) {
  await act(async () => {
    mermaidHarness.renders[index]?.reject(new Error("invalid Mermaid"));
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
