// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceMember } from "@/lib/auth";
import type { WorkspaceContext } from "@/lib/workspace-permission";

const mocks = vi.hoisted(() => ({
  changeMemberRole: vi.fn(),
  confirm: vi.fn(() => true),
  refresh: vi.fn(),
  removeMember: vi.fn(),
  restoreMember: vi.fn(),
  suspendMember: vi.fn(),
  transferOwnership: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth", () => ({
  changeMemberRole: mocks.changeMemberRole,
  removeMember: mocks.removeMember,
  restoreMember: mocks.restoreMember,
  suspendMember: mocks.suspendMember,
  transferOwnership: mocks.transferOwnership,
}));

import { WorkspaceMembersAdmin } from "./workspace-members-admin";

const members: WorkspaceMember[] = [
  {
    userId: "owner-1",
    login: "owner",
    avatarUrl: "https://example.com/owner.png",
    email: "owner@example.com",
    role: "owner",
    status: "active",
  },
  {
    userId: "admin-1",
    login: "admin",
    avatarUrl: "https://example.com/admin.png",
    email: null,
    role: "admin",
    status: "active",
  },
  {
    userId: "reviewer-1",
    login: "reviewer",
    avatarUrl: "https://example.com/reviewer.png",
    email: "reviewer@example.com",
    role: "reviewer",
    status: "active",
  },
  {
    userId: "reviewer-2",
    login: "paused",
    avatarUrl: "https://example.com/paused.png",
    email: null,
    role: "reviewer",
    status: "suspended",
  },
];

const context: WorkspaceContext = {
  workspace: { id: "workspace-1", accountLogin: "folio" },
  role: "owner",
  memberStatus: "active",
  globalStatus: "active",
  isSystemAdmin: false,
  entitlements: [],
  onboardingState: "ready",
};

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
  mocks.confirm.mockReturnValue(true);
});

describe("WorkspaceMembersAdmin", () => {
  it("limits an admin to reviewer lifecycle actions and represents suspended members", async () => {
    const container = await mount({ ...context, role: "admin" });

    expect(container.querySelector("table")).not.toBeNull();
    expect(row(container, "owner").querySelectorAll("button")).toHaveLength(0);
    expect(row(container, "admin").querySelectorAll("button")).toHaveLength(0);
    expect(button(row(container, "reviewer"), "정지")).toBeTruthy();
    expect(button(row(container, "reviewer"), "제거")).toBeTruthy();
    expect(button(row(container, "paused"), "복원")).toBeTruthy();
    expect(row(container, "paused").textContent).toContain("정지됨");
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.textContent).not.toContain("소유권 이전");
  });

  it("lets an owner change roles and confirms ownership transfer", async () => {
    mocks.changeMemberRole.mockResolvedValue({ ok: true });
    mocks.transferOwnership.mockResolvedValue({ ok: true });
    const container = await mount(context);
    const roleSelect = row(container, "reviewer").querySelector("select")!;

    await act(async () => {
      roleSelect.value = "admin";
      roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button(row(container, "admin"), "소유권 이전").click());

    expect(mocks.changeMemberRole).toHaveBeenCalledWith("workspace-1", "reviewer-1", "admin");
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("소유권"));
    expect(mocks.transferOwnership).toHaveBeenCalledWith("workspace-1", "admin-1");
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("confirms removal and leaves other rows enabled while one action is pending", async () => {
    let resolve!: (value: { ok: true }) => void;
    mocks.removeMember.mockReturnValue(new Promise((done) => (resolve = done)));
    const container = await mount(context);

    await act(async () => button(row(container, "reviewer"), "제거").click());

    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("제거"));
    expect(button(row(container, "reviewer"), "처리 중").disabled).toBe(true);
    expect(button(row(container, "admin"), "정지").disabled).toBe(false);

    await act(async () => resolve({ ok: true }));
  });

  it("shows a Korean error and refreshes stale state after a 409", async () => {
    mocks.suspendMember.mockRejectedValue(
      Object.assign(new Error("membership conflict"), { shouldRefresh: true }),
    );
    const container = await mount(context);

    await act(async () => button(row(container, "reviewer"), "정지").click());

    expect(container.querySelector('[aria-busy="false"]')).not.toBeNull();
    expect(container.textContent).toContain("멤버 정보가 변경되었습니다");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the table usable and reports a Korean error when a mutation fails", async () => {
    mocks.restoreMember.mockRejectedValue(new Error("network down"));
    const container = await mount(context);

    await act(async () => button(row(container, "paused"), "복원").click());

    expect(container.textContent).toContain("멤버 요청을 처리하지 못했습니다");
    expect(button(row(container, "paused"), "복원").disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("disables all actions when the current membership is suspended", async () => {
    const container = await mount({ ...context, memberStatus: "suspended" });

    expect(container.textContent).toContain("정지된 멤버십");
    expect(container.querySelectorAll("button, select")).toHaveLength(0);
  });
});

async function mount(workspaceContext: WorkspaceContext) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  window.confirm = mocks.confirm;
  await act(async () =>
    root.render(
      <WorkspaceMembersAdmin initialMembers={members} workspaceContext={workspaceContext} />,
    ),
  );
  return container;
}

function row(container: HTMLElement, login: string): HTMLTableRowElement {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((element) =>
    element.textContent?.includes(login),
  )!;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find((element) =>
    element.textContent?.includes(label),
  )!;
}
