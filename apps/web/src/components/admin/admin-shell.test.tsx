// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/admin/overview" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { AdminShell } from "./admin-shell";

const roots: Root[] = [];
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  navigation.pathname = "/admin/overview";
});

describe("AdminShell", () => {
  it("renders ready Phase 2 navigation in the dense responsive shell", async () => {
    const container = await mount();

    expect(
      container.firstElementChild?.classList.contains("lg:grid-cols-[266px_minmax(0,1fr)]"),
    ).toBe(true);
    expect(linkLabels(container)).toEqual(["Overview", "Users", "Workspaces", "Audit log"]);
    expect(container.textContent).toContain("Workspaces");
    expect(container.textContent).not.toContain("Operations");
  });

  it("marks the current admin section active", async () => {
    navigation.pathname = "/admin/workspaces/00000000-0000-4000-8000-000000000001";
    const container = await mount();

    expect(
      container.querySelector('a[href="/admin/workspaces"]')?.getAttribute("aria-current"),
    ).toBe("page");
  });
});

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<AdminShell>content</AdminShell>));
  return container;
}

function linkLabels(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll("a"), (link) => link.textContent ?? "");
}
