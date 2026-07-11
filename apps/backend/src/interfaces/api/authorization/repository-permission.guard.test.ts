import "reflect-metadata";
import { type WorkspaceRow, repositoriesRepo } from "@folio/db";
import type { GitHubRepoAccessLevel } from "@folio/github";
import { ACCOUNT_TYPE } from "@folio/types";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoAccessService } from "../../../domain/auth/repo-access.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { RepositoryPermissionGuard } from "./repository-permission.guard.js";
import { REQUIRE_LIVE_REPOSITORY_PERMISSION } from "./require-live-repository-permission.decorator.js";
import { REQUIRE_REPOSITORY_PERMISSION } from "./require-repository-permission.decorator.js";

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
  const access = { assertLevelAtLeast: vi.fn(), assertLiveLevelAtLeast: vi.fn() };
  const resolver = { resolveById: vi.fn() };
  let reflector: Reflector;
  let guard: RepositoryPermissionGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockImplementation((metadataKey) =>
      metadataKey === REQUIRE_REPOSITORY_PERMISSION ? "write" : undefined,
    );
    access.assertLevelAtLeast.mockResolvedValue(true);
    access.assertLiveLevelAtLeast.mockResolvedValue(true);
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
    expect(access.assertLiveLevelAtLeast).toHaveBeenCalledWith(
      { owner: "acme", repo: "folio", username: "octocat" },
      "write",
    );
    expect(access.assertLevelAtLeast).not.toHaveBeenCalled();
    expect(request.workspace).toBe(workspace);
  });

  it("denies a body-scoped action below the required GitHub level before attaching scope", async () => {
    access.assertLiveLevelAtLeast.mockResolvedValue(false);
    const { context, request } = contextFor({ body: { owner: "acme", repo: "folio" } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(CoreException);

    expect(request.workspace).toBeUndefined();
  });

  it.each([
    { cached: "write", downgraded: "read", required: "write" },
    { cached: "admin", downgraded: "write", required: "admin" },
  ] satisfies {
    cached: GitHubRepoAccessLevel;
    downgraded: GitHubRepoAccessLevel;
    required: GitHubRepoAccessLevel;
  }[])(
    "denies live $required after a cached $cached grant is downgraded to $downgraded",
    async ({ cached, downgraded, required }) => {
      const getUserRepoPermissionLevel = vi
        .fn()
        .mockResolvedValueOnce(cached)
        .mockResolvedValueOnce(downgraded);
      const liveAccess = new RepoAccessService({
        getUserRepoPermissionLevel,
        getResolvedRepositoryPermissionLevels: vi.fn(),
      } as never);
      await expect(liveAccess.assertLevelAtLeast(REF, cached)).resolves.toBe(true);
      vi.mocked(reflector.getAllAndOverride).mockImplementation((metadataKey) =>
        metadataKey === REQUIRE_REPOSITORY_PERMISSION ? required : undefined,
      );
      guard = new RepositoryPermissionGuard(reflector, liveAccess, resolver as never);
      const { context } = contextFor({ params: { owner: "acme", repo: "folio" } });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(CoreException);

      expect(getUserRepoPermissionLevel).toHaveBeenCalledTimes(2);
    },
  );

  it("checks route repositories at their declared read level", async () => {
    vi.mocked(reflector.getAllAndOverride).mockImplementation((metadataKey) =>
      metadataKey === REQUIRE_REPOSITORY_PERMISSION ? "read" : undefined,
    );
    const { context } = contextFor({ params: { owner: "acme", repo: "folio" } });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(access.assertLevelAtLeast).toHaveBeenCalledWith(
      { owner: "acme", repo: "folio", username: "octocat" },
      "read",
    );
    expect(access.assertLiveLevelAtLeast).not.toHaveBeenCalled();
    expect(repositoriesRepo.getByFullName).not.toHaveBeenCalled();
  });

  it("denies a live read-level mutation after its warmed grant is revoked", async () => {
    const getUserRepoPermissionLevel = vi
      .fn()
      .mockResolvedValueOnce("read")
      .mockResolvedValueOnce("none");
    const liveAccess = new RepoAccessService({
      getUserRepoPermissionLevel,
      getResolvedRepositoryPermissionLevels: vi.fn(),
    } as never);
    await expect(liveAccess.assertLevelAtLeast(REF, "read")).resolves.toBe(true);
    const { context } = contextFor({ params: { owner: "acme", repo: "folio" } });
    Reflect.defineMetadata(REQUIRE_LIVE_REPOSITORY_PERMISSION, true, context.getHandler());
    vi.mocked(reflector.getAllAndOverride).mockRestore();
    Reflect.defineMetadata(REQUIRE_REPOSITORY_PERMISSION, "read", context.getHandler());
    guard = new RepositoryPermissionGuard(reflector, liveAccess, resolver as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(CoreException);

    expect(getUserRepoPermissionLevel).toHaveBeenCalledTimes(2);
  });

  it("reuses a warmed read grant for cache-eligible routes", async () => {
    const getUserRepoPermissionLevel = vi.fn().mockResolvedValueOnce("read");
    const cachedAccess = new RepoAccessService({
      getUserRepoPermissionLevel,
      getResolvedRepositoryPermissionLevels: vi.fn(),
    } as never);
    await expect(cachedAccess.assertLevelAtLeast(REF, "read")).resolves.toBe(true);
    const { context } = contextFor({ params: { owner: "acme", repo: "folio" } });
    vi.mocked(reflector.getAllAndOverride).mockRestore();
    Reflect.defineMetadata(REQUIRE_REPOSITORY_PERMISSION, "read", context.getHandler());
    guard = new RepositoryPermissionGuard(reflector, cachedAccess, resolver as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(getUserRepoPermissionLevel).toHaveBeenCalledOnce();
  });
});

const REF = { owner: "acme", repo: "folio", username: "octocat" };

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
