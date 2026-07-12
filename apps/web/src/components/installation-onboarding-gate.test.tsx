// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installationUrl } from "@/lib/auth";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { InstallationOnboardingGate } from "./installation-onboarding-gate";

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

describe("InstallationOnboardingGate", () => {
  it("does not block ready workspaces", async () => {
    const container = await mount("ready");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("directs uninstalled workspaces to GitHub App installation", async () => {
    const container = await mount("install_required");

    expect(container.textContent).toContain("GitHub App 설치가 필요합니다");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(installationUrl());
  });

  it("offers reconnection when the installed App is no longer available", async () => {
    const container = await mount("reinstall_required");

    expect(container.textContent).toContain("GitHub App을 다시 연결해야 합니다");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(installationUrl());
  });

  it("explains suspended membership without offering installation", async () => {
    const container = await mount("membership_suspended");

    expect(container.textContent).toContain("연결이 해제되었습니다");
    expect(container.querySelector("a")).toBeNull();
  });

  it.each(["/onboarding/install", "/admin/workspaces"])(
    "bypasses the gate on %s",
    async (pathname) => {
      navigation.pathname = pathname;
      const container = await mount("install_required");

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    },
  );
});

async function mount(
  onboardingState: React.ComponentProps<typeof InstallationOnboardingGate>["onboardingState"],
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () =>
    root.render(<InstallationOnboardingGate onboardingState={onboardingState} />),
  );
  return container;
}
