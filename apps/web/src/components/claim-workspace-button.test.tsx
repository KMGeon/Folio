// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/api-client", () => ({
  apiRequest: mocks.apiRequest,
}));

import { ClaimWorkspaceButton } from "./claim-workspace-button";

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
  vi.clearAllMocks();
});

describe("ClaimWorkspaceButton", () => {
  it("posts only the installation id and opens workspace settings", async () => {
    mocks.apiRequest.mockResolvedValue({ id: "membership-1" });
    const container = await mount(<ClaimWorkspaceButton installationId={123} />);

    await act(async () => {
      container.querySelector("button")!.click();
    });

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/workspaces/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installationId: 123 }),
    });
    expect(mocks.push).toHaveBeenCalledWith("/settings/workspaces");
  });

  it("shows an actionable Korean error when the claim fails", async () => {
    mocks.apiRequest.mockRejectedValue(new Error("claim failed"));
    const container = await mount(<ClaimWorkspaceButton installationId={123} />);

    await act(async () => {
      container.querySelector("button")!.click();
    });

    expect(container.textContent).toContain("워크스페이스 연결에 실패했습니다");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

async function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}
