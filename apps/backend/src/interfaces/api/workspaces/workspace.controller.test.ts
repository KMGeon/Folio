import "reflect-metadata";
import { GLOBAL_STATUS } from "@folio/types";
import { BadRequestException, RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceClaimFacade } from "../../../application/authorization/workspace-claim.facade.js";
import { createInstallationClaimToken } from "../../../domain/auth/installation-claim-token.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { successResponse } from "../common/api-response.js";
import { SessionAuthGuard, type AuthedUser } from "../common/session-auth.guard.js";
import { WorkspaceController } from "./workspace.controller.js";

vi.mock("../../../config.js", () => ({
  config: { GITHUB_APP_WEBHOOK_SECRET: "claim-secret" },
  cookieIsSecure: () => false,
}));

const user: AuthedUser = {
  id: "user-1",
  login: "user-login",
  avatarUrl: "https://avatars.example/user-1",
  isSystemAdmin: false,
};

function createController() {
  const facade = {
    claimAsOwner: vi.fn(),
    currentContext: vi.fn(),
    listAvailableWorkspaces: vi.fn(),
    selectWorkspace: vi.fn(),
  };
  return {
    controller: new WorkspaceController(facade as unknown as WorkspaceClaimFacade),
    facade,
  };
}

function claimToken(overrides: { userId?: string; installationId?: number } = {}) {
  return createInstallationClaimToken(
    {
      userId: overrides.userId ?? user.id,
      installationId: overrides.installationId ?? 123,
      expiresAt: Date.now() + 60_000,
    },
    "claim-secret",
  );
}

describe("WorkspaceController", () => {
  it("declares the workspace base path and session guard", () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkspaceController)).toBe("api/v1/workspaces");
    expect(Reflect.getMetadata(GUARDS_METADATA, WorkspaceController)).toEqual([SessionAuthGuard]);
  });

  it.each([
    ["current", "current", RequestMethod.GET],
    ["list", "/", RequestMethod.GET],
    ["claim", "claim", RequestMethod.POST],
    ["select", "select", RequestMethod.POST],
  ] as const)("declares %s route metadata", (methodName, path, method) => {
    const handler = WorkspaceController.prototype[methodName];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
  });

  it("returns the exact current-context payload for the common envelope interceptor", async () => {
    const { controller, facade } = createController();
    const context = {
      workspace: null,
      role: null,
      memberStatus: null,
      globalStatus: GLOBAL_STATUS.ACTIVE,
      isSystemAdmin: false,
      entitlements: [],
      onboardingState: "install_required",
    };
    facade.currentContext.mockResolvedValue(context);

    await expect(controller.current(user, { cookies: {} }).then(successResponse)).resolves.toEqual({
      success: true,
      data: context,
    });
    expect(facade.currentContext).toHaveBeenCalledWith("user-1");
  });

  it("uses the server-held workspace preference for the current context", async () => {
    const { controller, facade } = createController();
    facade.currentContext.mockResolvedValue({ workspace: { id: "workspace-1" } });

    await controller.current(user, { cookies: { folio_workspace: "workspace-1" } });

    expect(facade.currentContext).toHaveBeenCalledWith("user-1", "workspace-1");
  });

  it("lists the authenticated user's available workspaces", async () => {
    const { controller, facade } = createController();
    const workspaces = [{ id: "workspace-1", accountLogin: "acme" }];
    facade.listAvailableWorkspaces.mockResolvedValue(workspaces);

    await expect(controller.list(user)).resolves.toEqual(workspaces);

    expect(facade.listAvailableWorkspaces).toHaveBeenCalledWith("user-1");
  });

  it("validates a selected workspace and stores only its verified id in a cookie", async () => {
    const { controller, facade } = createController();
    const response = { cookie: vi.fn() };
    const workspace = { id: "6ccdb9ad-2e29-4a08-b531-a00b7bf94411", accountLogin: "acme" };
    facade.selectWorkspace.mockResolvedValue(workspace);

    await expect(controller.select(user, { workspaceId: workspace.id }, response)).resolves.toBe(
      workspace,
    );

    expect(facade.selectWorkspace).toHaveBeenCalledWith("user-1", workspace.id);
    expect(response.cookie).toHaveBeenCalledWith(
      "folio_workspace",
      workspace.id,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("rejects an invalid workspace selection body", async () => {
    const { controller, facade } = createController();

    await expect(
      controller.select(user, { workspaceId: "not-a-uuid" }, { cookie: vi.fn() }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(facade.selectWorkspace).not.toHaveBeenCalled();
  });

  it("passes the verified installation id to the claim facade and clears the proof", async () => {
    const { controller, facade } = createController();
    const member = { id: "member-1" };
    facade.claimAsOwner.mockResolvedValue(member);
    const response = { clearCookie: vi.fn() };

    await expect(
      controller.claim(
        user,
        { installationId: 123 },
        { cookies: { folio_installation_claim: claimToken() } },
        response,
      ),
    ).resolves.toBe(member);

    expect(facade.claimAsOwner).toHaveBeenCalledWith({
      userId: "user-1",
      installationId: 123,
    });
    expect(response.clearCookie).toHaveBeenCalledWith("folio_installation_claim", { path: "/" });
  });

  it.each([
    [claimToken({ userId: "other-user" }), { installationId: 123 }],
    [claimToken({ installationId: 999 }), { installationId: 123 }],
    ["invalid-token", { installationId: 123 }],
  ])("fails claim closed when proof is absent or does not match", async (token, body) => {
    const { controller, facade } = createController();
    const response = { clearCookie: vi.fn() };

    const error = await controller
      .claim(user, body, { cookies: { folio_installation_claim: token } }, response)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CoreException);
    expect((error as CoreException).errorType).toBe(ErrorType.WorkspaceNotFound);
    expect(facade.claimAsOwner).not.toHaveBeenCalled();
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it("rejects client-supplied account identity fields", async () => {
    const { controller, facade } = createController();

    await expect(
      controller.claim(
        user,
        { installationId: 123, githubAccountId: 999 },
        { cookies: { folio_installation_claim: claimToken() } },
        { clearCookie: vi.fn() },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(facade.claimAsOwner).not.toHaveBeenCalled();
  });
});
