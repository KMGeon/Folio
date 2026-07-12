// @vitest-environment happy-dom

import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DashboardFilterPanel, type DashboardFilterState } from "./dashboard-filter-panel";

const mountedRoots: Root[] = [];
Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("DashboardFilterPanel", () => {
  it("applies a changed draft only after Save changes", async () => {
    const container = await mount(<Harness />);

    await click(button(container, "Filters"));
    await chooseOrdering(container, "lines");

    expect(appliedOrdering(container)).toBe("updated");

    await click(button(container, "Save changes"));

    expect(appliedOrdering(container)).toBe("lines");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(container, "Filters"));
  });

  it("discards a draft on Cancel, Escape, and outside interaction", async () => {
    const container = await mount(<Harness />);
    const trigger = button(container, "Filters");

    await click(trigger);
    await chooseOrdering(container, "lines");
    await click(button(container, "Cancel"));
    expect(appliedOrdering(container)).toBe("updated");
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    await chooseOrdering(container, "lines");
    await pressEscape();
    expect(appliedOrdering(container)).toBe("updated");
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    await chooseOrdering(container, "lines");
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(appliedOrdering(container)).toBe("updated");
    expect(document.activeElement).toBe(trigger);
  });
});

function Harness() {
  const [filters, setFilters] = useState<DashboardFilterState>({
    grouping: "repository",
    ordering: "updated",
    direction: "desc",
    closedRange: "1d",
    showDrafts: true,
    visibleProperties: ["Repository", "ID"],
  });
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen((current) => !current)}>
        Filters
      </button>
      <output aria-label="Applied ordering">{filters.ordering}</output>
      <DashboardFilterPanel
        open={open}
        filters={filters}
        onOpenChange={setOpen}
        onSave={setFilters}
        triggerRef={triggerRef}
      />
    </>
  );
}

function button(container: ParentNode, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!match) {
    throw new Error(`Missing button: ${label}`);
  }
  return match;
}

function appliedOrdering(container: ParentNode): string | null {
  return container.querySelector('output[aria-label="Applied ordering"]')?.textContent ?? null;
}

async function mount(element: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
}

async function chooseOrdering(container: ParentNode, value: "updated" | "lines"): Promise<void> {
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Ordering"]');
  if (!select) {
    throw new Error("Missing ordering select");
  }
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function pressEscape(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
}
