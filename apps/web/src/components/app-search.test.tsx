// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("@/lib/dashboard-api", () => ({
  fetchDashboard: vi.fn(() => new Promise(() => {})),
}));

import { AppSearch } from "./app-search";
import { GlobalNavigationRail } from "./global-navigation-rail";

const mountedRoots: Root[] = [];

Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
  });
  document.body.replaceChildren();
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
});

describe("AppSearch", () => {
  it("uses normal button activation for Enter and Space dashboard navigation", async () => {
    const container = await mount(React.createElement(AppSearch));
    const trigger = getButton(container, "검색");

    for (const key of ["Enter", " "]) {
      await click(trigger);
      const dashboardResult = getButton(container, "대시보드");

      await activateButtonWithKeyboard(dashboardResult, key);

      expect(navigation.push).toHaveBeenLastCalledWith("/dashboard");
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    }
    expect(navigation.push).toHaveBeenCalledTimes(2);
  });

  it("autofocuses, dismisses, and returns focus to the invoking rail control", async () => {
    const container = await mount(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(GlobalNavigationRail, { user: null }),
        React.createElement(AppSearch),
      ),
    );
    const railSearch = container.querySelector<HTMLButtonElement>(
      'aside button[aria-label="검색"]',
    );
    expect(railSearch).not.toBeNull();

    await click(railSearch!);

    const input = container.querySelector<HTMLInputElement>('input[aria-label="PR, repo 검색"]');
    expect(document.activeElement).toBe(input);

    await pressKey(document, "Escape");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(railSearch);
  });

  it("keeps Tab focus within the open search dialog", async () => {
    const container = await mount(React.createElement(AppSearch));
    await click(getButton(container, "검색"));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="PR, repo 검색"]');
    const results = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    );
    const lastResult = results.at(-1);
    expect(input).not.toBeNull();
    expect(lastResult).not.toBeUndefined();

    await pressKey(input!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(lastResult);

    await pressKey(lastResult!, "Tab");
    expect(document.activeElement).toBe(input);
  });

  it("renders an accessible modal and dismisses it from the backdrop", async () => {
    const container = await mount(React.createElement(AppSearch));
    const trigger = getButton(container, "검색");
    await click(trigger);
    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    expect(dialog?.getAttribute("aria-label")).toBe("검색");

    const backdrop = dialog?.parentElement;
    expect(backdrop).not.toBeNull();
    await act(async () => {
      backdrop!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

async function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(element);
  });
  return container;
}

function getButton(container: ParentNode, name: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name || candidate.textContent?.includes(name),
  );
  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }
  return button;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

async function pressKey(
  target: Pick<EventTarget, "dispatchEvent">,
  key: string,
  init: KeyboardEventInit = {},
) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

async function activateButtonWithKeyboard(button: HTMLButtonElement, key: string) {
  // Happy DOM omits native key-to-click activation, so mirror the browser's event timing.
  await act(async () => {
    const keydown = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    button.dispatchEvent(keydown);
    if (key === "Enter" && !keydown.defaultPrevented) {
      button.click();
    }

    const keyup = new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true });
    button.dispatchEvent(keyup);
    if (key === " " && !keyup.defaultPrevented) {
      button.click();
    }
  });
}
