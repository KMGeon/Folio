// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GlobalUser } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  approveGlobalUser: vi.fn(),
  refresh: vi.fn(),
  suspendGlobalUser: vi.fn(),
  transferSystemAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth", () => ({
  approveGlobalUser: mocks.approveGlobalUser,
  suspendGlobalUser: mocks.suspendGlobalUser,
  transferSystemAdmin: mocks.transferSystemAdmin,
}));

import { SystemUsersAdmin } from "./system-users-admin";

const users: GlobalUser[] = [
  {
    id: "admin-1",
    login: "folio-admin",
    avatarUrl: "https://example.com/admin.png",
    email: "admin@example.com",
    globalStatus: "active",
    isSystemAdmin: true,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "pending-1",
    login: "waiting-user",
    avatarUrl: "https://example.com/pending.png",
    email: null,
    globalStatus: "pending",
    isSystemAdmin: false,
    createdAt: "2026-07-02T00:00:00.000Z",
  },
  {
    id: "active-1",
    login: "active-user",
    avatarUrl: "https://example.com/active.png",
    email: "active@example.com",
    globalStatus: "active",
    isSystemAdmin: false,
    createdAt: "2026-07-03T00:00:00.000Z",
  },
  {
    id: "suspended-1",
    login: "suspended-user",
    avatarUrl: "https://example.com/suspended.png",
    email: null,
    globalStatus: "suspended",
    isSystemAdmin: false,
    createdAt: "2026-07-04T00:00:00.000Z",
  },
];

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
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("SystemUsersAdmin", () => {
  it("shows every global user with lifecycle and system-admin indicators", async () => {
    const container = await mount(<SystemUsersAdmin initialUsers={users} />);

    expect(container.textContent).toContain("folio-admin");
    expect(container.textContent).toContain("시스템 관리자");
    expect(row(container, "waiting-user").textContent).toContain("승인 대기");
    expect(row(container, "active-user").textContent).toContain("활성");
    expect(row(container, "suspended-user").textContent).toContain("정지됨");
    expect(buttons(row(container, "folio-admin"))).toHaveLength(0);
    expect(buttons(row(container, "suspended-user"))).toHaveLength(0);
  });

  it("approves a pending user, updates the row, and refreshes server state", async () => {
    mocks.approveGlobalUser.mockResolvedValue({ ok: true });
    const container = await mount(<SystemUsersAdmin initialUsers={users} />);

    await click(button(row(container, "waiting-user"), "승인"));

    expect(mocks.approveGlobalUser).toHaveBeenCalledWith("pending-1");
    expect(row(container, "waiting-user").textContent).toContain("활성");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("suspends an active user without exposing the current system admin", async () => {
    mocks.suspendGlobalUser.mockResolvedValue({ ok: true });
    const container = await mount(<SystemUsersAdmin initialUsers={users} />);

    await click(button(row(container, "active-user"), "정지"));

    expect(mocks.suspendGlobalUser).toHaveBeenCalledWith("active-1");
    expect(row(container, "active-user").textContent).toContain("정지됨");
    expect(buttons(row(container, "folio-admin"))).toHaveLength(0);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("transfers system-admin only after explicit confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm");
    mocks.transferSystemAdmin.mockResolvedValue({ ok: true });
    const container = await mount(<SystemUsersAdmin initialUsers={users} />);

    confirm.mockReturnValueOnce(false);
    await click(button(row(container, "active-user"), "관리자 이전"));
    expect(mocks.transferSystemAdmin).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await click(button(row(container, "active-user"), "관리자 이전"));

    expect(confirm).toHaveBeenLastCalledWith(
      "active-user 님에게 시스템 관리자 권한을 이전하시겠습니까? 이전 후에는 이 작업을 되돌릴 수 없습니다.",
    );
    expect(mocks.transferSystemAdmin).toHaveBeenCalledWith("active-1");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps pending state isolated to the row being changed", async () => {
    let resolveApproval: ((value: { ok: true }) => void) | undefined;
    mocks.approveGlobalUser.mockReturnValue(
      new Promise((resolve) => {
        resolveApproval = resolve;
      }),
    );
    const anotherPending: GlobalUser = {
      ...users[1]!,
      id: "pending-2",
      login: "another-user",
    };
    const container = await mount(<SystemUsersAdmin initialUsers={[...users, anotherPending]} />);

    const approving = button(row(container, "waiting-user"), "승인");
    const other = button(row(container, "another-user"), "승인");
    await act(async () => {
      approving.click();
      await Promise.resolve();
    });

    expect(approving.disabled).toBe(true);
    expect(other.disabled).toBe(false);

    await act(async () => resolveApproval?.({ ok: true }));
  });

  it("shows actionable Korean feedback and refreshes stale conflict state", async () => {
    const conflict = Object.assign(new Error("stale system-admin snapshot"), {
      shouldRefresh: true,
    });
    mocks.suspendGlobalUser.mockRejectedValue(conflict);
    const container = await mount(<SystemUsersAdmin initialUsers={users} />);

    await click(button(row(container, "active-user"), "정지"));

    expect(container.textContent).toContain("요청을 처리하지 못했습니다");
    expect(container.textContent).toContain("stale system-admin snapshot");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

function row(container: HTMLElement, login: string): HTMLLIElement {
  const match = [...container.querySelectorAll("li")].find((item) =>
    item.textContent?.includes(login),
  );
  if (!(match instanceof HTMLLIElement)) {
    throw new Error(`Missing row for ${login}`);
  }
  return match;
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = buttons(container).find((item) => item.textContent?.includes(label));
  if (!match) {
    throw new Error(`Missing ${label} button`);
  }
  return match;
}

async function click(target: HTMLButtonElement): Promise<void> {
  await act(async () => target.click());
}

async function mount(element: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}
