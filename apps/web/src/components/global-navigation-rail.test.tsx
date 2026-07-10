// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

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
});

describe("global navigation rail", () => {
  it("renders the compact rail and primary app destinations", async () => {
    const container = await mountRail();
    const rail = container.querySelector("aside");

    expect(rail?.classList.contains("w-12")).toBe(true);
    expect(container.querySelector("#global-navigation-drawer")).toBeNull();
    expect(getLink(container, "대시보드").getAttribute("href")).toBe("/dashboard");
    expect(getLink(container, "설정").getAttribute("href")).toBe("/settings/preferences");
    expect(getButton(container, "계정 메뉴").getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the back-to-dashboard action on settings routes", async () => {
    navigation.pathname = "/settings/preferences";
    const container = await mountRail();

    expect(getLink(container, "앱으로 돌아가기").getAttribute("href")).toBe("/dashboard");
    expect(container.querySelector('button[aria-label="계정 메뉴"]')).toBeNull();
  });

  it("dismisses the account menu with Escape and outside pointer input", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const container = await mountRail();
    const trigger = getButton(container, "계정 메뉴");

    await click(trigger);
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    await pressKey(document, "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    await act(async () => {
      outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("lets Tab and Shift+Tab move focus out before closing the account menu", async () => {
    const container = await mountRail(true);
    const trigger = getButton(container, "계정 메뉴");
    const afterRail = container.querySelector<HTMLButtonElement>("[data-after-rail]");

    await click(trigger);
    const forwardTab = await pressKey(document.activeElement!, "Tab");
    expect(forwardTab.defaultPrevented).toBe(false);
    await focus(afterRail!);
    expect(document.activeElement).toBe(afterRail);
    expect(container.querySelector('[role="menu"]')).toBeNull();

    await click(trigger);
    const reverseTab = await pressKey(document.activeElement!, "Tab", { shiftKey: true });
    expect(reverseTab.defaultPrevented).toBe(false);
    const railSearch = getButton(container, "검색");
    await focus(railSearch);
    expect(document.activeElement).toBe(railSearch);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

async function mountRail(withAfterControl = false) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(GlobalNavigationRail, { user: null }),
        withAfterControl
          ? React.createElement("button", { type: "button", "data-after-rail": true })
          : null,
      ),
    );
  });
  return container;
}

function getButton(container: ParentNode, name: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }
  return button;
}

function getLink(container: ParentNode, name: string) {
  const link = container.querySelector<HTMLAnchorElement>(`a[aria-label="${name}"]`);
  if (!link) {
    throw new Error(`Link not found: ${name}`);
  }
  return link;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

async function focus(element: HTMLElement) {
  await act(async () => {
    element.focus();
  });
}

async function pressKey(
  target: Pick<EventTarget, "dispatchEvent">,
  key: string,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}
