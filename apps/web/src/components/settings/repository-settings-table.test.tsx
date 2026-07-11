// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RepositorySummary } from "@/lib/repositories-api";

const mocks = vi.hoisted(() => ({
  setRepositoryEnabled: vi.fn(),
}));

vi.mock("@/lib/repositories-api", () => ({
  setRepositoryEnabled: mocks.setRepositoryEnabled,
}));

import { RepositorySettingsTable } from "./repository-settings-table";

const repositories: RepositorySummary[] = [
  repository({
    id: "repo-disconnected",
    fullName: "acme/disconnected",
    name: "disconnected",
    folioEnabled: true,
    githubAccessActive: false,
  }),
  repository({ id: "repo-zulu", fullName: "acme/zulu", name: "zulu" }),
  repository({ id: "repo-alpha", fullName: "acme/alpha", name: "alpha", private: true }),
];

const mountedRoots: Root[] = [];
Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("RepositorySettingsTable", () => {
  it("sorts connected repositories first by name and filters immediately without case sensitivity", async () => {
    const container = await mount();

    expect(
      [...container.querySelectorAll<HTMLTableCellElement>("thead th")].map((header) =>
        header.textContent?.trim(),
      ),
    ).toEqual(["Repository", "Folio review"]);

    expect(rows(container).map((row) => row.dataset.repository)).toEqual([
      "acme/alpha",
      "acme/zulu",
      "acme/disconnected",
    ]);

    const search = container.querySelector<HTMLInputElement>('input[aria-label="저장소 검색"]')!;
    await act(async () => {
      typeIn(search, "ZULU");
    });

    expect(rows(container).map((row) => row.dataset.repository)).toEqual(["acme/zulu"]);
  });

  it("retains disconnected repositories as muted disabled off rows", async () => {
    const container = await mount();
    const disconnected = row(container, "acme/disconnected");
    const switchButton = disconnected.querySelector<HTMLButtonElement>('[role="switch"]')!;

    expect(disconnected.textContent).toContain("연결 해제됨");
    expect(disconnected.className).toContain("text-muted-foreground");
    expect(switchButton.getAttribute("aria-checked")).toBe("false");
    expect(switchButton.getAttribute("aria-label")).toContain("acme/disconnected");
    expect(switchButton.tagName).toBe("BUTTON");
    expect(switchButton.type).toBe("button");
    expect(switchButton.getAttribute("role")).toBe("switch");
    expect(switchButton.className).toContain("focus-visible:ring-3");
    expect(switchButton.disabled).toBe(true);
  });

  it("disables every switch while one repository mutation is pending", async () => {
    const request = deferred<RepositorySummary>();
    mocks.setRepositoryEnabled.mockReturnValue(request.promise);
    const container = await mount();
    const alphaSwitch = switchFor(container, "acme/alpha");
    const zuluSwitch = switchFor(container, "acme/zulu");

    await act(async () => {
      alphaSwitch.click();
      await Promise.resolve();
    });

    expect(alphaSwitch.disabled).toBe(true);
    expect(zuluSwitch.disabled).toBe(true);
    await act(async () => alphaSwitch.click());
    expect(mocks.setRepositoryEnabled).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(
        repository({ id: "repo-alpha", fullName: "acme/alpha", name: "alpha", folioEnabled: true }),
      );
    });
    expect(alphaSwitch.disabled).toBe(false);
    expect(zuluSwitch.disabled).toBe(false);
  });

  it("updates a connected repository from the returned confirmed state", async () => {
    mocks.setRepositoryEnabled.mockResolvedValue(
      repository({ id: "repo-alpha", fullName: "acme/alpha", name: "alpha", folioEnabled: true }),
    );
    const container = await mount();
    const switchButton = row(container, "acme/alpha").querySelector<HTMLButtonElement>(
      '[role="switch"]',
    )!;

    await act(async () => switchButton.click());

    expect(mocks.setRepositoryEnabled).toHaveBeenCalledWith("repo-alpha", true);
    expect(switchButton.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the last confirmed state and shows a row alert when mutation fails", async () => {
    mocks.setRepositoryEnabled.mockRejectedValue(new Error("network down"));
    const container = await mount();
    const alpha = row(container, "acme/alpha");
    const switchButton = alpha.querySelector<HTMLButtonElement>('[role="switch"]')!;

    await act(async () => switchButton.click());

    expect(switchButton.getAttribute("aria-checked")).toBe("false");
    expect(alpha.querySelector('[role="alert"]')?.textContent).toContain(
      "저장소 설정을 변경하지 못했습니다.",
    );
  });

  it("disables all switches with the authorization reason and does not call the API", async () => {
    const reason = "워크스페이스 관리자 권한이 필요합니다.";
    const container = await mount(reason);
    const alpha = row(container, "acme/alpha");
    const switchButton = alpha.querySelector<HTMLButtonElement>('[role="switch"]')!;

    expect(alpha.textContent).toContain(reason);
    expect(switchButton.disabled).toBe(true);
    await act(async () => switchButton.click());
    expect(mocks.setRepositoryEnabled).not.toHaveBeenCalled();
  });

  it("distinguishes no installed repositories from a search with no matches", async () => {
    const emptyContainer = await mount(null, []);
    expect(emptyContainer.textContent).toContain("연결된 저장소가 없습니다.");

    const searchContainer = await mount();
    const search = searchContainer.querySelector<HTMLInputElement>(
      'input[aria-label="저장소 검색"]',
    )!;
    await act(async () => {
      typeIn(search, "missing");
    });
    expect(searchContainer.textContent).toContain("검색 결과가 없습니다.");
  });
});

async function mount(disabledReason: string | null = null, initialRepositories = repositories) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () =>
    root.render(
      <RepositorySettingsTable
        initialRepositories={initialRepositories}
        disabledReason={disabledReason}
      />,
    ),
  );
  return container;
}

function rows(container: HTMLElement): HTMLTableRowElement[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr[data-repository]")];
}

function row(container: HTMLElement, fullName: string): HTMLTableRowElement {
  return rows(container).find((element) => element.dataset.repository === fullName)!;
}

function switchFor(container: HTMLElement, fullName: string): HTMLButtonElement {
  return row(container, fullName).querySelector<HTMLButtonElement>('[role="switch"]')!;
}

function repository(overrides: Partial<RepositorySummary>): RepositorySummary {
  return {
    id: "repo-1",
    installationId: "installation-1",
    githubRepoId: 1,
    owner: "acme",
    name: "repo",
    fullName: "acme/repo",
    private: false,
    defaultBranch: "main",
    folioEnabled: false,
    githubAccessActive: true,
    ...overrides,
  };
}

function typeIn(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
