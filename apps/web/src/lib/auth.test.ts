import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthorizationApiError,
  changeMemberRole,
  getMe,
  installationUrl,
  listWorkspaceMembers,
  removeMember,
  restoreMember,
  suspendMember,
  transferOwnership,
} from "./auth";

const fetchMock = vi.fn<typeof fetch>();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function success(data: unknown): Response {
  return response({ success: true, data });
}

function failure(status: number, code: string, message: string): Response {
  return response(
    {
      success: false,
      error: { code, message },
      path: "/api/v1/test",
      timestamp: "2026-07-11T00:00:00.000Z",
    },
    status,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("authorization API clients", () => {
  it("builds the backend GitHub App installation initiation URL", () => {
    expect(installationUrl()).toBe("http://localhost:8080/api/v1/auth/github/install");
  });

  it("returns the current user's system-admin flag", async () => {
    const user = {
      id: "user-1",
      login: "root",
      avatarUrl: "https://avatars/root",
      isSystemAdmin: true,
    };
    fetchMock.mockResolvedValueOnce(success({ user }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMe()).resolves.toEqual(user);
  });

  it("returns null only when the current-user endpoint returns 401", async () => {
    fetchMock.mockResolvedValueOnce(failure(401, "unauthorized", "로그인이 필요합니다."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMe()).resolves.toBeNull();
  });

  it.each([
    [
      failure(503, "backend_unavailable", "인증 서비스를 사용할 수 없습니다."),
      503,
      "backend_unavailable",
    ],
    [response(null, 200), 200, "invalid_response"],
  ] as const)(
    "throws a typed current-user failure instead of treating it as logout",
    async (reply, status, code) => {
      fetchMock.mockResolvedValueOnce(reply);
      vi.stubGlobal("fetch", fetchMock);

      const error = await getMe().catch((caught) => caught);

      expect(error).toBeInstanceOf(AuthorizationApiError);
      expect(error).toMatchObject({ status, code });
    },
  );

  it("lists exact workspace member fields and forwards a server cookie", async () => {
    const members = [
      {
        userId: "user-1",
        login: "octocat",
        avatarUrl: "https://avatars.example/octocat",
        email: "octocat@example.com",
        role: "reviewer" as const,
        status: "active" as const,
      },
    ];
    fetchMock.mockResolvedValueOnce(success({ members }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listWorkspaceMembers("workspace-1", "folio_session=abc")).resolves.toEqual(
      members,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/workspaces/workspace-1/members"),
      expect.objectContaining({
        credentials: "include",
        headers: { accept: "application/json", cookie: "folio_session=abc" },
      }),
    );
  });

  it.each([
    [
      "suspend",
      () => suspendMember("workspace-1", "user-1"),
      "POST",
      "/members/user-1/suspend",
      undefined,
    ],
    [
      "restore",
      () => restoreMember("workspace-1", "user-1"),
      "POST",
      "/members/user-1/restore",
      undefined,
    ],
    ["remove", () => removeMember("workspace-1", "user-1"), "DELETE", "/members/user-1", undefined],
    [
      "change role",
      () => changeMemberRole("workspace-1", "user-1", "admin"),
      "PATCH",
      "/members/user-1/role",
      { role: "admin" },
    ],
  ] as const)(
    "returns the typed result for member %s",
    async (_name, action, method, path, body) => {
      fetchMock.mockResolvedValueOnce(success({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await action();

      expect(result).toEqual({ ok: true });
      expect(fetchMock.mock.calls[0]?.[0]).toEqual(
        new URL(`http://localhost:8080/api/v1/workspaces/workspace-1${path}`),
      );
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    },
  );

  it("transfers workspace ownership with the target user id", async () => {
    fetchMock.mockResolvedValueOnce(success({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(transferOwnership("workspace-1", "user-1")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/workspaces/workspace-1/members/transfer-ownership"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "user-1" }) }),
    );
  });

  it("propagates a 403 API message and status", async () => {
    fetchMock.mockResolvedValueOnce(failure(403, "forbidden", "관리자 권한이 필요합니다."));
    vi.stubGlobal("fetch", fetchMock);

    const error = await suspendMember("workspace-1", "user-1").catch((caught) => caught);

    expect(error).toBeInstanceOf(AuthorizationApiError);
    expect(error).toMatchObject({
      message: "관리자 권한이 필요합니다.",
      status: 403,
      code: "forbidden",
      shouldRefresh: false,
    });
  });

  it("marks a 409 API conflict as requiring a state refresh", async () => {
    fetchMock.mockResolvedValueOnce(
      failure(409, "workspace_membership_conflict", "새로고침 후 다시 시도하세요."),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await transferOwnership("workspace-1", "user-1").catch((caught) => caught);

    expect(error).toBeInstanceOf(AuthorizationApiError);
    expect(error).toMatchObject({
      message: "새로고침 후 다시 시도하세요.",
      status: 409,
      code: "workspace_membership_conflict",
      shouldRefresh: true,
    });
  });

  it("rejects a malformed response envelope with a typed client error", async () => {
    fetchMock.mockResolvedValueOnce(response(null));
    vi.stubGlobal("fetch", fetchMock);

    const error = await listWorkspaceMembers("workspace-1").catch((caught) => caught);

    expect(error).toBeInstanceOf(AuthorizationApiError);
    expect(error).toMatchObject({
      message: "워크스페이스 멤버를 불러오지 못했습니다.",
      status: 200,
      code: "invalid_response",
      shouldRefresh: false,
    });
  });
});
