import "reflect-metadata";
import { type WorkspaceRow, repositoriesRepo } from "@folio/db";
import { ACCOUNT_TYPE } from "@folio/types";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../../support/error/core-exception.js";
import { RepositoryPermissionGuard } from "./repository-permission.guard.js";

type FolioDbModule = Record<string, unknown> & {
  repositoriesRepo: typeof repositoriesRepo;
};

vi.mock("@folio/db", async (importOriginal) => {
  const actual = (await importOriginal()) as FolioDbModule;
  return {
    ...actual,
    repositoriesRepo: { ...actual.repositoriesRepo, getByFullName: vi.fn() },
  };
});

const now = new Date("2026-07-11T00:00:00.000Z");
const workspace: WorkspaceRow = {
  id: "workspace-1",
  githubAccountId: 42,
  accountLogin: "acme",
  accountType: ACCOUNT_TYPE.ORGANIZATION,
  createdAt: now,
  updatedAt: now,
};

describe("RepositoryPermissionGuard", () => {
  const access = { assertLevelAtLeast: vi.fn() };
  const resolver = { resolveById: vi.fn() };
  let reflector: Reflector;
  let guard: RepositoryPermissionGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue("write");
    access.assertLevelAtLeast.mockResolvedValue(true);
    resolver.resolveById.mockResolvedValue(workspace);
    vi.mocked(repositoriesRepo.getByFullName).mockResolvedValue({
      id: "repository-1",
      installationId: "installation-1",
      workspaceId: workspace.id,
      githubRepoId: 9,
      owner: "acme",
      name: "folio",
      fullName: "acme/folio",
      private: true,
      defaultBranch: "main",
      folioEnabled: true,
      createdAt: now,
      updatedAt: now,
    });
    guard = new RepositoryPermissionGuard(reflector, access as never, resolver as never);
  });

  it("authorizes a body-scoped repository and attaches only its server-resolved workspace", async () => {
    const { context, request } = contextFor({ body: { owner: "acme", repo: "folio" } });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(repositoriesRepo.getByFullName).toHaveBeenCalledWith("acme/folio");
    expect(resolver.resolveById).toHaveBeenCalledWith(workspace.id);
    expect(access.assertLevelAtLeast).toHaveBeenCalledWith(
      { owner: "acme", repo: "folio", username: "octocat" },
      "write",
    );
    expect(request.workspace).toBe(workspace);
  });

  it("denies a body-scoped action below the required GitHub level before attaching scope", async () => {
    access.assertLevelAtLeast.mockResolvedValue(false);
    const { context, request } = contextFor({ body: { owner: "acme", repo: "folio" } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(CoreException);

    expect(request.workspace).toBeUndefined();
  });

  it("checks route repositories at their declared read level", async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue("read");
    const { context } = contextFor({ params: { owner: "acme", repo: "folio" } });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(access.assertLevelAtLeast).toHaveBeenCalledWith(
      { owner: "acme", repo: "folio", username: "octocat" },
      "read",
    );
    expect(repositoriesRepo.getByFullName).not.toHaveBeenCalled();
  });
});

function contextFor(overrides: {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}) {
  const request = {
    ...overrides,
    user: { id: "user-1", login: "octocat", avatarUrl: "https://avatars/octocat" },
    workspace: undefined as WorkspaceRow | undefined,
  };
  const handler = () => undefined;
  class TestController {}
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
  return { context, request };
}
