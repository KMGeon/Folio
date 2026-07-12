import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/lib/auth";

const next = vi.hoisted(() => ({
  cookieValues: [{ name: "folio_session", value: "session-token" }],
  getMe: vi.fn(),
  headerPath: "/admin/users?q=octo&status=active",
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => next.cookieValues }),
  headers: async () => ({ get: () => next.headerPath }),
}));
vi.mock("next/navigation", () => ({ redirect: next.redirect }));
vi.mock("@/lib/auth", () => ({ getMe: next.getMe }));
vi.mock("@/components/app-layout", () => ({
  AppLayout: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("@/components/admin/admin-shell", () => ({
  AdminShell: ({ children }: React.PropsWithChildren) => children,
}));

import AdminLayout from "./layout";

const admin: SessionUser = {
  id: "admin-1",
  login: "root",
  avatarUrl: "https://avatars/root",
  isSystemAdmin: true,
};

beforeEach(() => {
  next.cookieValues = [{ name: "folio_session", value: "session-token" }];
  next.headerPath = "/admin/users?q=octo&status=active";
  next.getMe.mockReset();
  next.redirect.mockClear();
});

describe("AdminLayout access boundary", () => {
  it("redirects an unauthenticated request to login with the exact Admin return path", async () => {
    next.getMe.mockResolvedValue(null);

    await expect(AdminLayout({ children: "content" })).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirect=%2Fadmin%2Fusers%3Fq%3Docto%26status%3Dactive",
    );
    expect(next.getMe).toHaveBeenCalledWith("folio_session=session-token");
  });

  it("redirects an authenticated ordinary user to the dashboard", async () => {
    next.getMe.mockResolvedValue({ ...admin, isSystemAdmin: false });

    await expect(AdminLayout({ children: "content" })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("rethrows an auth 5xx so the Admin error boundary can recover", async () => {
    const failure = Object.assign(new Error("사용자 정보를 불러오지 못했습니다."), {
      name: "AuthorizationApiError",
      status: 503,
      code: "backend_unavailable",
    });
    next.getMe.mockRejectedValue(failure);

    await expect(AdminLayout({ children: "content" })).rejects.toBe(failure);
    expect(next.redirect).not.toHaveBeenCalled();
  });
});
