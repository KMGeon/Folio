// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  selectWorkspace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/workspace-permission", () => ({
  selectWorkspace: mocks.selectWorkspace,
}));

import { WorkspaceSwitcher } from "./workspace-switcher";

const mountedRoots: Root[] = [];
Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workspaces = [
  {
    id: "workspace-personal",
    accountLogin: "tbnwsDev",
    accountType: "User" as const,
    role: "owner" as const,
    memberStatus: "active" as const,
  },
  {
    id: "workspace-org",
    accountLogin: "TobeNetworksGlobal",
    accountType: "Organization" as const,
    role: "owner" as const,
    memberStatus: "active" as const,
  },
];

afterEach(async () => {
  await act(async () => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
  });
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("WorkspaceSwitcher", () => {
  it("lists all authorized workspaces and refreshes the scoped settings after selection", async () => {
    mocks.selectWorkspace.mockResolvedValue(workspaces[1]);
    const container = await mount();
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="워크스페이스 선택"]',
    )!;

    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      "tbnwsDev",
      "TobeNetworksGlobal",
    ]);

    await act(async () => {
      select.value = "workspace-org";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(mocks.selectWorkspace).toHaveBeenCalledWith("workspace-org");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("restores the active selection and explains a failed switch", async () => {
    mocks.selectWorkspace.mockRejectedValue(new Error("unavailable"));
    const container = await mount();
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="워크스페이스 선택"]',
    )!;

    await act(async () => {
      select.value = "workspace-org";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(select.value).toBe("workspace-personal");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("전환하지 못했습니다");
  });
});

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <WorkspaceSwitcher workspaces={workspaces} selectedWorkspaceId="workspace-personal" />,
    );
  });
  return container;
}
