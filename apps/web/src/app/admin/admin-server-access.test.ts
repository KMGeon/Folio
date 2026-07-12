import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

const next = vi.hoisted(() => ({
  cookieValues: [{ name: "folio_session", value: "session-token" }],
  headerPath: "/admin/audit?action=user_approve&target=octo",
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => next.cookieValues }),
  headers: async () => ({ get: () => next.headerPath }),
}));

vi.mock("next/navigation", () => ({ redirect: next.redirect }));

import { getAdminServerAccess, readAdminServerData } from "./admin-server-access";

beforeEach(() => {
  next.cookieValues = [{ name: "folio_session", value: "session-token" }];
  next.headerPath = "/admin/audit?action=user_approve&target=octo";
  next.redirect.mockClear();
});

describe("Admin server access", () => {
  it("preserves the validated exact Admin pathname and search with server cookies", async () => {
    await expect(getAdminServerAccess()).resolves.toEqual({
      cookie: "folio_session=session-token",
      returnPath: "/admin/audit?action=user_approve&target=octo",
    });
  });

  it("rejects a lookalike path as login return context", async () => {
    next.headerPath = "/administrator?next=/admin/users";

    await expect(getAdminServerAccess()).resolves.toMatchObject({ returnPath: "/admin/overview" });
  });

  it.each([
    [401, "/login?redirect=%2Fadmin%2Faudit%3Faction%3Duser_approve%26target%3Docto"],
    [403, "/dashboard"],
  ])("redirects an Admin read %s through the server boundary", async (status, destination) => {
    const access = await getAdminServerAccess();
    const read = vi.fn().mockRejectedValue(apiError(status));

    await expect(readAdminServerData(access, read)).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
    expect(next.redirect).toHaveBeenCalledWith(destination);
  });

  it("rethrows a 5xx Admin read for the route error boundary", async () => {
    const access = await getAdminServerAccess();
    const failure = apiError(503);

    await expect(readAdminServerData(access, () => Promise.reject(failure))).rejects.toBe(failure);
    expect(next.redirect).not.toHaveBeenCalled();
  });
});

function apiError(status: number): ApiError {
  return new ApiError(
    {
      success: false,
      error: { code: status === 401 ? "unauthorized" : "failure", message: "failed" },
      path: "/api/v1/admin/audit-logs",
      timestamp: "2026-07-12T00:00:00.000Z",
    },
    status,
  );
}
