import "reflect-metadata";
import { type UserRow, USER_STATUS, usersRepo } from "@folio/db";
import type { usersRepo as DbUsersRepo } from "@folio/db";
import { GLOBAL_STATUS } from "@folio/types";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType, type ErrorTypeDefinition } from "../../../support/error/error-type.js";
import type { AuthedUser } from "../common/session-auth.guard.js";
import { GlobalStatusGuard } from "./global-status.guard.js";
import { REQUIRE_GLOBAL_STATUS, RequireGlobalStatus } from "./require-global-status.decorator.js";
import { SystemAdminGuard } from "./system-admin.guard.js";

type FolioDbModule = { usersRepo: typeof DbUsersRepo } & Record<string, unknown>;

vi.mock("@folio/db", async (importOriginal) => {
  const actual = (await importOriginal()) as FolioDbModule;
  return {
    ...actual,
    usersRepo: {
      ...actual.usersRepo,
      getById: vi.fn(),
    },
  };
});

const now = new Date("2026-07-11T00:00:00.000Z");
const actor: AuthedUser = {
  id: "user-1",
  login: "octocat",
  avatarUrl: "https://avatars.example/octocat",
};

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

function contextFor(user: AuthedUser | null = actor): ExecutionContext {
  const request = { user: user ?? undefined };
  const handler = () => undefined;
  class TestController {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
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

describe("RequireGlobalStatus", () => {
  it("stores the exact requested status under the global-status metadata key", () => {
    class TestController {}

    RequireGlobalStatus(GLOBAL_STATUS.SUSPENDED)(TestController);

    expect(REQUIRE_GLOBAL_STATUS).toBe("require_global_status");
    expect(Reflect.getMetadata(REQUIRE_GLOBAL_STATUS, TestController)).toBe(
      GLOBAL_STATUS.SUSPENDED,
    );
  });
});

describe("GlobalStatusGuard", () => {
  let reflector: Reflector;
  let guard: GlobalStatusGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersRepo.getById).mockResolvedValue(userRow());
    reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    guard = new GlobalStatusGuard(reflector);
  });

  it("defaults to active and allows the current active database row", async () => {
    const context = contextFor();

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_GLOBAL_STATUS, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
  });

  it("denies a current database row whose status does not match", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(
      userRow({ globalStatus: GLOBAL_STATUS.SUSPENDED }),
    );

    await expectCoreError(() => guard.canActivate(contextFor()), ErrorType.Forbidden);
  });

  it("honors an explicit status metadata override", async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(GLOBAL_STATUS.SUSPENDED);
    vi.mocked(usersRepo.getById).mockResolvedValue(
      userRow({ globalStatus: GLOBAL_STATUS.SUSPENDED }),
    );

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
  });

  it("returns Unauthorized when the session actor is missing", async () => {
    await expectCoreError(() => guard.canActivate(contextFor(null)), ErrorType.Unauthorized);

    expect(usersRepo.getById).not.toHaveBeenCalled();
  });

  it("returns Forbidden when the current database actor is missing", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(null);

    await expectCoreError(() => guard.canActivate(contextFor()), ErrorType.Forbidden);

    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
  });
});

describe("SystemAdminGuard", () => {
  const guard = new SystemAdminGuard();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a current database row with the system-admin service role", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(userRow({ isSystemAdmin: true }));

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);

    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
  });

  it("denies a current non-admin database row", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(userRow({ isSystemAdmin: false }));

    await expectCoreError(() => guard.canActivate(contextFor()), ErrorType.Forbidden);
  });

  it("returns Unauthorized when the session actor is missing", async () => {
    await expectCoreError(() => guard.canActivate(contextFor(null)), ErrorType.Unauthorized);

    expect(usersRepo.getById).not.toHaveBeenCalled();
  });

  it("returns Forbidden when the current database actor is missing", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(null);

    await expectCoreError(() => guard.canActivate(contextFor()), ErrorType.Forbidden);

    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
  });
});
