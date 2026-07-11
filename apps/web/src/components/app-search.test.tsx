// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
}));

const dashboardApi = vi.hoisted(() => ({
  fetchDashboardOpenPullPages: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("@/lib/dashboard-api", () => ({
  fetchDashboard: vi.fn(() => Promise.resolve({ pulls: [] })),
  fetchDashboardOpenPullPages: dashboardApi.fetchDashboardOpenPullPages,
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
  dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(openPages());
});

describe("AppSearch", () => {
  it("shows recent open PRs without page commands and navigates to review", async () => {
    dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(
      openPages([pull(98, "Older change", "2시간 전"), pull(99, "Newest change", "4분 전")]),
    );
    const container = await mount(React.createElement(AppSearch));

    await click(getButton(container, "검색"));
    await flushPromises();

    expect(dashboardApi.fetchDashboardOpenPullPages).toHaveBeenCalledWith({
      limit: 10,
      ordering: "updated",
      direction: "desc",
      showDrafts: true,
    });
    expect(container.textContent).not.toContain("대시보드");
    const results = getDialogButtons(container);
    expect(results.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Folio#99"),
      expect.stringContaining("Folio#98"),
    ]);

    await click(results[0]!);
    expect(navigation.push).toHaveBeenCalledWith("/KMGeon/Folio/pull/99/chapters/1");
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

    const input = container.querySelector<HTMLInputElement>('input[aria-label="PR 검색"]');
    expect(document.activeElement).toBe(input);

    await pressKey(document, "Escape");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(railSearch);
  });

  it("keeps Tab focus within the open search dialog", async () => {
    const container = await mount(React.createElement(AppSearch));
    await click(getButton(container, "검색"));
    await flushPromises();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="PR 검색"]');
    const results = getDialogButtons(container);
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

  it("debounces the query and searches open PRs", async () => {
    vi.useFakeTimers();
    try {
      const container = await mount(React.createElement(AppSearch));
      await click(getButton(container, "검색"));
      await flushPromises();
      dashboardApi.fetchDashboardOpenPullPages.mockClear();
      dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(
        openPages([pull(120, "Search match", "5분 전")]),
      );

      await changeInput(getSearchInput(container), "Search match");
      expect(dashboardApi.fetchDashboardOpenPullPages).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(200));

      expect(dashboardApi.fetchDashboardOpenPullPages).toHaveBeenCalledWith({
        limit: 10,
        q: "Search match",
        ordering: "updated",
        direction: "desc",
        showDrafts: true,
      });
      expect(container.textContent).toContain("Folio#120");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows loading and empty states for recent open PRs", async () => {
    dashboardApi.fetchDashboardOpenPullPages.mockReturnValue(new Promise(() => {}));
    const loadingContainer = await mount(React.createElement(AppSearch));
    await click(getButton(loadingContainer, "검색"));
    expect(loadingContainer.textContent).toContain("불러오는 중");

    await act(async () => mountedRoots.pop()?.unmount());
    dashboardApi.fetchDashboardOpenPullPages.mockResolvedValue(openPages([]));
    const emptyContainer = await mount(React.createElement(AppSearch));
    await click(getButton(emptyContainer, "검색"));
    await flushPromises();
    expect(emptyContainer.textContent).toContain("열린 PR이 없습니다");
  });

  it("shows an error and retries the open PR request", async () => {
    dashboardApi.fetchDashboardOpenPullPages
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(openPages());
    const container = await mount(React.createElement(AppSearch));
    await click(getButton(container, "검색"));
    await flushPromises();
    expect(container.textContent).toContain("검색 결과를 불러오지 못했습니다");

    await click(getButton(container, "다시 시도"));
    await flushPromises();
    expect(dashboardApi.fetchDashboardOpenPullPages).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Folio#101");
  });

  it("ignores a response from an older query", async () => {
    vi.useFakeTimers();
    try {
      const recent = deferred<ReturnType<typeof openPages>>();
      dashboardApi.fetchDashboardOpenPullPages
        .mockReturnValueOnce(recent.promise)
        .mockResolvedValueOnce(openPages([pull(120, "Current match", "방금")]));
      const container = await mount(React.createElement(AppSearch));
      await click(getButton(container, "검색"));

      await changeInput(getSearchInput(container), "Current");
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(container.textContent).toContain("Current match");

      await act(async () => recent.resolve(openPages([pull(98, "Stale result", "방금")])));
      expect(container.textContent).not.toContain("Stale result");
    } finally {
      vi.useRealTimers();
    }
  });
});

function pull(number: number, title: string, updatedAt: string) {
  return {
    id: `folio-${number}`,
    org: "KMGeon",
    repo: "Folio",
    number,
    title,
    author: "reviewer",
    updatedAt,
    headBranch: `feature-${number}`,
    baseBranch: "main",
    status: "ready" as const,
    chapterCount: 2,
    viewedChapters: 0,
    changedFiles: 3,
    additions: 20,
    deletions: 4,
    risk: "low" as const,
  };
}

function openPages(items = [pull(101, "Newest change", "방금")]) {
  return {
    ready: { items, nextCursor: null, count: items.length },
    yours: { items: [], nextCursor: null, count: 0 },
    other: { items: [], nextCursor: null, count: 0 },
  };
}

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

function getDialogButtons(container: ParentNode) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
}

function getSearchInput(container: ParentNode) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="PR 검색"]');
  if (!input) {
    throw new Error("Search input not found");
  }
  return input;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
