import "reflect-metadata";
import {
  type UserRow,
  USER_STATUS,
  type WorkspaceMemberRow,
  type WorkspaceRow,
  repositoriesRepo,
  usersRepo,
} from "@folio/db";
import type { repositoriesRepo as DbRepositoriesRepo, usersRepo as DbUsersRepo } from "@folio/db";
import { ACCOUNT_TYPE, GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType, type ErrorTypeDefinition } from "../../../support/error/error-type.js";
import type { AuthedUser } from "../common/session-auth.guard.js";
import {
  REQUIRE_WORKSPACE_ROLE,
  RequireWorkspaceRole,
} from "./require-workspace-role.decorator.js";
import { WorkspaceRoleGuard } from "./workspace-role.guard.js";

type FolioDbModule = {
  repositoriesRepo: typeof DbRepositoriesRepo;
  usersRepo: typeof DbUsersRepo;
} & Record<string, unknown>;

vi.mock("@folio/db", async (importOriginal) => {
  const actual = (await importOriginal()) as FolioDbModule;
  return {
    ...actual,
    repositoriesRepo: {
      ...actual.repositoriesRepo,
      getByFullName: vi.fn(),
    },
    usersRepo: {
      ...actual.usersRepo,
      getById: vi.fn(),
    },
  };
});

const now = new Date("2026-07-10T00:00:00.000Z");
const actor: AuthedUser = {
  id: "user-1",
  login: "octocat",
  avatarUrl: "https://avatars.example/octocat",
};

function workspaceRow(overrides: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    id: "workspace-1",
    githubAccountId: 42,
    accountLogin: "acme",
    accountType: ACCOUNT_TYPE.ORGANIZATION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    githubUserId: 7,
    login: "octocat",
    avatarUrl: "https://avatars.example/octocat",
    email: "octocat@example.com",
    status: USER_STATUS.APPROVED,
    globalStatus: GLOBAL_STATUS.ACTIVE,
    isSystemAdmin: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memberRow(overrides: Partial<WorkspaceMemberRow> = {}): WorkspaceMemberRow {
  return {
    id: "membership-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    role: WORKSPACE_ROLE.ADMIN,
    status: MEMBERSHIP_STATUS.ACTIVE,
    elevatedBy: null,
    suspendedBy: null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

interface TestRequest {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: AuthedUser;
  workspace?: WorkspaceRow;
  workspaceMembership?: WorkspaceMemberRow;
}

function contextFor(
  params: Record<string, unknown> = { workspaceId: "workspace-1" },
  user: AuthedUser | null = actor,
  requestOverrides: Partial<TestRequest> = {},
) {
  const request: TestRequest = { params, user: user ?? undefined, ...requestOverrides };
  const handler = () => undefined;
  class TestController {}
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
  return { context, request };
}

async function expectCoreError(
  action: () => Promise<unknown>,
  expected: ErrorTypeDefinition,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(CoreException);
  expect(caught).toMatchObject({
    name: "CoreException",
    errorType: {
      code: expected.code,
      statusCode: expected.statusCode,
      message: expected.message,
    },
  });
}

describe("authorization error definitions", () => {
  it("defines the three Task 12 errors with their public contracts", () => {
    expect({
      Forbidden: ErrorType.Forbidden,
      WorkspaceNotFound: ErrorType.WorkspaceNotFound,
      NotEntitled: ErrorType.NotEntitled,
    }).toEqual({
      Forbidden: {
        code: "forbidden",
        statusCode: 403,
        message: "You are not allowed to perform this action.",
      },
      WorkspaceNotFound: {
        code: "workspace_not_found",
        statusCode: 404,
        message: "Workspace not found.",
      },
      NotEntitled: {
        code: "not_entitled",
        statusCode: 403,
        message: "Your plan does not include this feature.",
      },
    });
  });
});

describe("RequireWorkspaceRole", () => {
  it("stores the requested role under the guard metadata key", () => {
    class TestController {}

    RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)(TestController);

    expect(Reflect.getMetadata(REQUIRE_WORKSPACE_ROLE, TestController)).toBe(WORKSPACE_ROLE.ADMIN);
  });
});

describe("WorkspaceRoleGuard", () => {
  const resolver = {
    resolveById: vi.fn<(workspaceId: string) => Promise<WorkspaceRow | null>>(),
  };
  const memberships = {
    getMembership:
      vi.fn<(workspaceId: string, userId: string) => Promise<WorkspaceMemberRow | null>>(),
  };
  let reflector: Reflector;
  let guard: WorkspaceRoleGuard;
  let workspace: WorkspaceRow;
  let membership: WorkspaceMemberRow;

  beforeEach(() => {
    vi.clearAllMocks();
    workspace = workspaceRow();
    membership = memberRow();
    resolver.resolveById.mockResolvedValue(workspace);
    vi.mocked(usersRepo.getById).mockResolvedValue(userRow());
    vi.mocked(repositoriesRepo.getByFullName).mockResolvedValue(null);
    memberships.getMembership.mockResolvedValue(membership);
    reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(WORKSPACE_ROLE.ADMIN);
    guard = new WorkspaceRoleGuard(reflector, resolver as never, memberships as never);
  });

  it("allows an active admin and attaches the resolved workspace context", async () => {
    const { context, request } = contextFor();

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_WORKSPACE_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(resolver.resolveById).toHaveBeenCalledWith("workspace-1");
    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
    expect(memberships.getMembership).toHaveBeenCalledWith("workspace-1", "user-1");
    expect(request.workspace).toBe(workspace);
    expect(request.workspaceMembership).toBe(membership);
  });

  it("resolves a route repository to its server-owned workspace", async () => {
    vi.mocked(repositoriesRepo.getByFullName).mockResolvedValue({
      id: "repository-1",
      installationId: "installation-1",
      workspaceId: workspace.id,
      githubRepoId: 99,
      owner: "acme",
      name: "folio",
      fullName: "acme/folio",
      private: true,
      defaultBranch: "main",
      folioEnabled: true,
      githubAccessActive: true,
      prIndexStatus: "idle" as const,
      prIndexBackfilledAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const { context, request } = contextFor({ owner: "acme", repo: "folio" });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(repositoriesRepo.getByFullName).toHaveBeenCalledWith("acme/folio");
    expect(resolver.resolveById).toHaveBeenCalledWith(workspace.id);
    expect(request.workspace).toBe(workspace);
  });

  it("accepts a workspace attached by an earlier server-side authorization guard", async () => {
    const { context, request } = contextFor({}, actor, { workspace });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(resolver.resolveById).not.toHaveBeenCalled();
    expect(memberships.getMembership).toHaveBeenCalledWith(workspace.id, actor.id);
    expect(request.workspace).toBe(workspace);
  });

  it("never trusts a workspace id from the request body", async () => {
    const { context } = contextFor({}, actor, { body: { workspaceId: workspace.id } });

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(resolver.resolveById).not.toHaveBeenCalled();
    expect(repositoriesRepo.getByFullName).not.toHaveBeenCalled();
  });

  it("does not let a system admin bypass the required workspace role", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(userRow({ isSystemAdmin: true }));
    memberships.getMembership.mockResolvedValue(memberRow({ role: WORKSPACE_ROLE.REVIEWER }));
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it("denies a suspended membership", async () => {
    memberships.getMembership.mockResolvedValue(memberRow({ status: MEMBERSHIP_STATUS.SUSPENDED }));
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it("denies an inactive global user", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(
      userRow({ globalStatus: GLOBAL_STATUS.SUSPENDED }),
    );
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it("returns WorkspaceNotFound when the workspace does not exist", async () => {
    resolver.resolveById.mockResolvedValue(null);
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.WorkspaceNotFound);

    expect(usersRepo.getById).not.toHaveBeenCalled();
    expect(memberships.getMembership).not.toHaveBeenCalled();
    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it("fails closed when the actor database row is missing", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(null);
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it("fails closed when the workspace membership is missing", async () => {
    memberships.getMembership.mockResolvedValue(null);
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it("fails closed before loading data when required-role metadata is absent", async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined);
    const { context, request } = contextFor();

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(resolver.resolveById).not.toHaveBeenCalled();
    expect(usersRepo.getById).not.toHaveBeenCalled();
    expect(memberships.getMembership).not.toHaveBeenCalled();
    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });

  it.each([
    ["workspace id", {}, actor],
    ["session actor", { workspaceId: "workspace-1" }, null],
  ])("fails closed when the request has no %s", async (_label, params, user) => {
    const { context, request } = contextFor(params, user);

    await expectCoreError(() => guard.canActivate(context), ErrorType.Forbidden);

    expect(resolver.resolveById).not.toHaveBeenCalled();
    expect(usersRepo.getById).not.toHaveBeenCalled();
    expect(memberships.getMembership).not.toHaveBeenCalled();
    expect(request.workspace).toBeUndefined();
    expect(request.workspaceMembership).toBeUndefined();
  });
});
