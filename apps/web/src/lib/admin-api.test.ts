import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveAdminUser,
  fetchAdminAnalytics,
  fetchAdminAudit,
  fetchAdminOverview,
  fetchAdminUsers,
  suspendAdminUser,
  transferSystemAdmin,
} from "./admin-api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(response({ success: true, data: { ok: true } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin API", () => {
  it("builds the encoded users query and forwards server cookies", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ success: true, data: { items: [], nextCursor: null } }),
    );

    await fetchAdminUsers({
      q: "octo cat",
      status: "pending",
      limit: 25,
      cursor: "abc+/=",
      cookie: "folio_session=x",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL(
        "http://localhost:8080/api/v1/admin/users?q=octo+cat&status=pending&limit=25&cursor=abc%2B%2F%3D",
      ),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ cookie: "folio_session=x" }),
      }),
    );
  });

  it("builds the approved audit query and forwards server cookies", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ success: true, data: { items: [], nextCursor: null } }),
    );

    await fetchAdminAudit({
      q: "role change",
      action: "role_change",
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetId: "target-1",
      from: "2026-07-01T00:00:00+09:00",
      to: "2026-07-12T00:00:00Z",
      limit: 10,
      cursor: "next page",
      cookie: "folio_session=x",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL(
        "http://localhost:8080/api/v1/admin/audit-logs?q=role+change&action=role_change&workspaceId=workspace-1&actorUserId=actor-1&targetId=target-1&from=2026-07-01T00%3A00%3A00%2B09%3A00&to=2026-07-12T00%3A00%3A00Z&limit=10&cursor=next+page",
      ),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ cookie: "folio_session=x" }) }),
    );
  });

  it("fetches the overview with a forwarded server cookie", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        success: true,
        data: { metrics: { pendingUsers: 0 }, attention: [], recentAudit: [] },
      }),
    );

    await fetchAdminOverview({ cookie: "folio_session=x" });

    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL("http://localhost:8080/api/v1/admin/overview"),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ cookie: "folio_session=x" }) }),
    );
  });

  it("fetches the selected analytics range with a forwarded server cookie", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ success: true, data: { range: "30d", days: [], distributions: {} } }),
    );

    await fetchAdminAnalytics({ range: "30d", cookie: "folio_session=x" });

    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL("http://localhost:8080/api/v1/admin/analytics?range=30d"),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ cookie: "folio_session=x" }) }),
    );
  });

  it.each([
    [approveAdminUser, "/api/v1/admin/users/user%2F1/approve"],
    [suspendAdminUser, "/api/v1/admin/users/user%2F1/suspend"],
  ])("posts user lifecycle mutations", async (mutation, path) => {
    await expect(mutation("user/1")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, "http://localhost:8080"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts a JSON system-admin transfer", async () => {
    await expect(transferSystemAdmin("user-1")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/admin/system-admin/transfer"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "user-1" }),
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
  });

  it("redirects a browser to the dashboard when admin authority is lost", async () => {
    const browser = { location: { href: "", pathname: "/admin/users", search: "" } };
    vi.stubGlobal("window", browser);
    fetchMock.mockResolvedValueOnce(
      response(
        {
          success: false,
          error: { code: "forbidden", message: "Forbidden" },
          path: "/api/v1/admin/users",
          timestamp: "2026-07-12T00:00:00.000Z",
        },
        403,
      ),
    );

    void fetchAdminUsers({ limit: 25 });
    await vi.waitFor(() => expect(browser.location.href).toBe("/dashboard"));
  });
});

function response(payload: unknown, status = 200): Response {
  return { status, json: vi.fn(async () => payload) } as unknown as Response;
}
