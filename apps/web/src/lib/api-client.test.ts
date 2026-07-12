import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("preserves the browser pathname and search when redirecting a 401", async () => {
    const browser = {
      location: {
        href: "",
        pathname: "/admin/audit",
        search: "?action=user_approve&target=octo",
      },
    };
    vi.stubGlobal("window", browser);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 401 })),
    );

    void apiRequest("/api/v1/admin/audit-logs");

    await vi.waitFor(() =>
      expect(browser.location.href).toBe(
        "/login?redirect=%2Fadmin%2Faudit%3Faction%3Duser_approve%26target%3Docto",
      ),
    );
  });
});
