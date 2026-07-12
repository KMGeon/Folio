// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminUserItem, AdminUserPage } from "@folio/types";
import { ApiError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  fetchUsers: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  suspend: vi.fn(),
  transfer: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/admin-api", () => ({
  approveAdminUser: mocks.approve,
  fetchAdminUsers: mocks.fetchUsers,
  isGlobalUserConflict: (error: unknown) =>
    error instanceof ApiError &&
    error.status === 409 &&
    error.response.error.code === "global_user_conflict",
  suspendAdminUser: mocks.suspend,
  transferSystemAdmin: mocks.transfer,
}));

import { AdminUsersClient } from "./admin-users-client";

const admin = user("admin", "active", true);
const pending = user("waiting", "pending");
const active = user("active", "active");
const suspended = user("suspended", "suspended");
const initialPage: AdminUserPage = { items: [admin, pending, active, suspended], nextCursor: "c1" };
const mountedRoots: Root[] = [];

Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mocks.approve.mockResolvedValue({ ok: true });
  mocks.suspend.mockResolvedValue({ ok: true });
  mocks.transfer.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("AdminUsersClient", () => {
  it("exposes only one-way lifecycle actions allowed by authoritative row state", async () => {
    const container = await mountClient();

    expect(labels(row(container, "waiting"))).toEqual(["승인"]);
    expect(labels(row(container, "active"))).toEqual(["정지", "관리자 이전"]);
    expect(labels(row(container, "suspended"))).toEqual([]);
    expect(labels(row(container, "admin"))).toEqual([]);
  });

  it("renders each user's labeled joined date and time", async () => {
    const container = await mountClient();
    const joined = row(container, "waiting").querySelector("time");

    expect(joined?.getAttribute("datetime")).toBe(pending.createdAt);
    expect(joined?.parentElement?.textContent).toContain("가입:");
    expect(joined?.textContent).toContain("2026");
  });

  it("renders an explicit empty user state", async () => {
    const container = await mount(
      <AdminUsersClient initialPage={{ items: [], nextCursor: null }} status="all" />,
    );

    expect(container.textContent).toContain("조건에 맞는 사용자가 없습니다");
    expect(container.querySelectorAll("[data-admin-user-row]")).toHaveLength(0);
  });

  it("makes no request when confirmation is cancelled", async () => {
    const container = await mountClient();
    await click(button(row(container, "waiting"), "승인"));
    await click(button(container.querySelector('[role="dialog"]')!, "취소"));

    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("keeps the old status while approval is pending and refreshes after success", async () => {
    let resolve: ((value: { ok: true }) => void) | undefined;
    mocks.approve.mockReturnValue(new Promise((done) => (resolve = done)));
    const container = await mountClient();
    await click(button(row(container, "waiting"), "승인"));
    await click(button(container.querySelector('[role="dialog"]')!, "사용자 승인"));

    expect(row(container, "waiting").textContent).toContain("승인 대기");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => resolve?.({ ok: true }));
    expect(row(container, "waiting").textContent).toContain("승인 대기");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the old status and shows an inline alert when suspension fails", async () => {
    mocks.suspend.mockRejectedValue(new Error("network unavailable"));
    const container = await mountClient();
    await confirmAction(container, "active", "정지", "사용자 정지");

    expect(row(container, "active").textContent).toContain("활성");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("network unavailable");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes a 409 global-user conflict without changing the old status", async () => {
    mocks.suspend.mockRejectedValue(
      new ApiError(
        {
          success: false,
          error: { code: "global_user_conflict", message: "stale user" },
          path: "/api/v1/admin/users/active/suspend",
          timestamp: "2026-07-12T00:00:00.000Z",
        },
        409,
      ),
    );
    const container = await mountClient();
    await confirmAction(container, "active", "정지", "사용자 정지");

    expect(row(container, "active").textContent).toContain("활성");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after successful suspension without an optimistic status edit", async () => {
    const container = await mountClient();
    await confirmAction(container, "active", "정지", "사용자 정지");

    expect(row(container, "active").textContent).toContain("활성");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("navigates to the dashboard after successful system-admin transfer", async () => {
    const container = await mountClient();
    await confirmAction(container, "active", "관리자 이전", "관리자 이전");

    expect(mocks.transfer).toHaveBeenCalledWith(active.id);
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("retains initial rows after a next-page failure and enables retry", async () => {
    mocks.fetchUsers
      .mockRejectedValueOnce(new Error("page unavailable"))
      .mockResolvedValueOnce({ items: [user("next", "active")], nextCursor: null });
    const container = await mountClient();

    await click(button(container, "더 보기"));
    expect(container.textContent).toContain("waiting");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("page unavailable");
    await click(button(container, "다시 시도"));

    expect(container.textContent).toContain("next");
    expect(mocks.fetchUsers).toHaveBeenCalledTimes(2);
  });

  it("does not append duplicate IDs from a repeated cursor response", async () => {
    mocks.fetchUsers.mockResolvedValue({
      items: [active, user("next", "active")],
      nextCursor: null,
    });
    const container = await mountClient();

    await click(button(container, "더 보기"));

    expect(
      [...container.querySelectorAll("li")].filter((item) => item.textContent?.includes("active")),
    ).toHaveLength(1);
    expect(container.textContent).toContain("next");
  });

  it("reconciles authoritative rows, actions, and pagination after a server rerender", async () => {
    mocks.fetchUsers
      .mockRejectedValueOnce(new Error("stale page failure"))
      .mockResolvedValueOnce({ items: [user("fresh-next", "active")], nextCursor: null });
    const mounted = await mountRerenderableClient(initialPage);

    await click(button(mounted.container, "더 보기"));
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain(
      "stale page failure",
    );

    const refreshedWaiting = { ...pending, globalStatus: "active" as const };
    await mounted.rerender({ items: [refreshedWaiting], nextCursor: "fresh-cursor" });

    expect(row(mounted.container, "waiting").textContent).toContain("활성");
    expect(labels(row(mounted.container, "waiting"))).toEqual(["정지", "관리자 이전"]);
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
    await click(button(mounted.container, "더 보기"));
    expect(mocks.fetchUsers).toHaveBeenLastCalledWith({
      q: "octo",
      status: "active",
      limit: 25,
      cursor: "fresh-cursor",
    });
  });

  it("ignores an unresolved stale pagination result after an authoritative rerender", async () => {
    let resolveStale: ((page: AdminUserPage) => void) | undefined;
    mocks.fetchUsers.mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)));
    const mounted = await mountRerenderableClient(initialPage);

    await act(async () => button(mounted.container, "더 보기").click());
    await mounted.rerender({ items: [pending], nextCursor: "fresh-cursor" });
    await act(async () =>
      resolveStale?.({ items: [user("stale-next", "active")], nextCursor: null }),
    );

    expect(mounted.container.textContent).not.toContain("stale-next");
    expect(mounted.container.textContent).toContain("waiting");
    expect(button(mounted.container, "더 보기").disabled).toBe(false);
  });
});

async function mountClient(): Promise<HTMLDivElement> {
  return mount(<AdminUsersClient initialPage={initialPage} q="octo" status="active" />);
}

async function mountRerenderableClient(initialPage: AdminUserPage): Promise<{
  container: HTMLDivElement;
  rerender: (page: AdminUserPage) => Promise<void>;
}> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const render = async (page: AdminUserPage) => {
    await act(async () =>
      root.render(<AdminUsersClient initialPage={page} q="octo" status="active" />),
    );
  };
  await render(initialPage);
  return { container, rerender: render };
}

async function confirmAction(
  container: HTMLElement,
  login: string,
  actionLabel: string,
  confirmationLabel: string,
): Promise<void> {
  await click(button(row(container, login), actionLabel));
  await click(button(container.querySelector('[role="dialog"]')!, confirmationLabel));
}

function user(
  login: string,
  globalStatus: AdminUserItem["globalStatus"],
  isSystemAdmin = false,
): AdminUserItem {
  return {
    id: `00000000-0000-4000-8000-${login.padEnd(12, "0").slice(0, 12)}`,
    login,
    avatarUrl: `https://example.com/${login}.png`,
    email: `${login}@example.com`,
    globalStatus,
    isSystemAdmin,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

function row(container: ParentNode, login: string): HTMLLIElement {
  const match = [...container.querySelectorAll<HTMLLIElement>("li")].find((item) =>
    item.textContent?.includes(login),
  );
  if (!match) {
    throw new Error(`Missing row: ${login}`);
  }
  return match;
}

function labels(container: ParentNode): string[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].map(
    (item) => item.textContent?.trim() ?? "",
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
