import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type WorkspaceContext,
  canManageMembers,
  canManageRoles,
  canSeeSystemUsers,
  getWorkspaceContext,
  hasEntitlement,
  listAvailableWorkspaces,
  repositoryActivationReason,
  selectWorkspace,
} from "./workspace-permission";

const fetchMock = vi.fn<typeof fetch>();

const base: WorkspaceContext = {
  workspace: { id: "ws1", accountLogin: "acme" },
  role: "reviewer",
  memberStatus: "active",
  globalStatus: "active",
  isSystemAdmin: false,
  entitlements: ["review_read"],
  onboardingState: "ready",
};

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("current workspace context client", () => {
  it("reads the exact response data and forwards a server cookie", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: base }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceContext("folio_session=abc")).resolves.toEqual(base);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/workspaces/current"),
      expect.objectContaining({
        credentials: "include",
        headers: { accept: "application/json", cookie: "folio_session=abc" },
      }),
    );
  });

  it("returns null when no current context can be loaded", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "unauthorized", message: "Authentication is required." },
          path: "/api/v1/workspaces/current",
          timestamp: "2026-07-11T00:00:00.000Z",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceContext()).resolves.toBeNull();
  });
});

describe("workspace selection client", () => {
  it("lists workspaces with the forwarded server cookie", async () => {
    const workspaces = [
      {
        id: "ws1",
        accountLogin: "acme",
        accountType: "Organization",
        role: "owner",
        memberStatus: "active",
      },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: workspaces }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAvailableWorkspaces("folio_session=abc")).resolves.toEqual(workspaces);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/workspaces"),
      expect.objectContaining({
        headers: { accept: "application/json", cookie: "folio_session=abc" },
      }),
    );
  });

  it("posts only the selected workspace id", async () => {
    const workspace = {
      id: "ws1",
      accountLogin: "acme",
      accountType: "Organization",
      role: "owner",
      memberStatus: "active",
    } as const;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: workspace }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(selectWorkspace(workspace.id)).resolves.toEqual(workspace);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/workspaces/select"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ workspaceId: workspace.id }),
      }),
    );
  });
});

describe("workspace permission helpers", () => {
  it("only owner/admin manage members", () => {
    expect(canManageMembers({ ...base, role: "admin" })).toBe(true);
    expect(canManageMembers({ ...base, role: "owner" })).toBe(true);
    expect(canManageMembers(base)).toBe(false);
    expect(canManageMembers({ ...base, role: "admin", memberStatus: "suspended" })).toBe(false);
    expect(canManageMembers(null)).toBe(false);
  });

  it("only owner manages roles", () => {
    expect(canManageRoles({ ...base, role: "owner" })).toBe(true);
    expect(canManageRoles({ ...base, role: "admin" })).toBe(false);
    expect(canManageRoles({ ...base, role: "owner", memberStatus: "suspended" })).toBe(false);
    expect(canManageRoles(null)).toBe(false);
  });

  it("only system admin sees system users", () => {
    expect(canSeeSystemUsers({ ...base, isSystemAdmin: true })).toBe(true);
    expect(canSeeSystemUsers(base)).toBe(false);
    expect(canSeeSystemUsers({ ...base, isSystemAdmin: true, globalStatus: "suspended" })).toBe(
      false,
    );
    expect(canSeeSystemUsers(null)).toBe(false);
  });

  it("checks entitlement membership", () => {
    expect(hasEntitlement(base, "review_read")).toBe(true);
    expect(hasEntitlement(base, "pr_analysis")).toBe(false);
  });

  it("explains repository activation restrictions in authorization order", () => {
    expect(repositoryActivationReason({ ...base, memberStatus: "suspended", role: "admin" })).toBe(
      "활성 워크스페이스 멤버만 변경할 수 있습니다.",
    );
    expect(repositoryActivationReason(base)).toBe("워크스페이스 관리자 권한이 필요합니다.");
    expect(repositoryActivationReason({ ...base, role: "admin" })).toBe(
      "현재 이용 범위에 저장소 활성화가 포함되지 않습니다.",
    );
    expect(
      repositoryActivationReason({
        ...base,
        role: "owner",
        entitlements: [...base.entitlements, "repo_activation"],
      }),
    ).toBeNull();
  });
});
