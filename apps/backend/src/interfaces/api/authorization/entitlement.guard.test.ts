import "reflect-metadata";
import { type UserRow, USER_STATUS, usersRepo } from "@folio/db";
import type { usersRepo as DbUsersRepo } from "@folio/db";
import { ENTITLEMENT_FEATURE, GLOBAL_STATUS } from "@folio/types";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AlwaysEntitledService,
  type EntitlementDecision,
  type EntitlementQuery,
  EntitlementService,
} from "../../../domain/authorization/entitlement.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType, type ErrorTypeDefinition } from "../../../support/error/error-type.js";
import type { AuthedUser } from "../common/session-auth.guard.js";
import { EntitlementGuard } from "./entitlement.guard.js";
import { REQUIRE_ENTITLEMENT, RequireEntitlement } from "./require-entitlement.decorator.js";

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
const sessionActor: AuthedUser = {
  id: "user-1",
  login: "octocat",
  avatarUrl: "https://avatars.example/octocat",
  isSystemAdmin: false,
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

function contextFor(user: AuthedUser | null = sessionActor): ExecutionContext {
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

class StubEntitlementService extends EntitlementService {
  readonly canUseFeature = vi.fn<(input: EntitlementQuery) => Promise<EntitlementDecision>>();
}

describe("RequireEntitlement", () => {
  it("stores the exact requested feature under the entitlement metadata key", () => {
    class TestController {}

    RequireEntitlement(ENTITLEMENT_FEATURE.COMMENT)(TestController);

    expect(REQUIRE_ENTITLEMENT).toBe("require_entitlement");
    expect(Reflect.getMetadata(REQUIRE_ENTITLEMENT, TestController)).toBe(
      ENTITLEMENT_FEATURE.COMMENT,
    );
  });
});

describe("EntitlementGuard", () => {
  let reflector: Reflector;
  let entitlements: StubEntitlementService;
  let guard: EntitlementGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersRepo.getById).mockResolvedValue(userRow());
    reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(ENTITLEMENT_FEATURE.PR_ANALYSIS);
    entitlements = new StubEntitlementService();
    entitlements.canUseFeature.mockResolvedValue({ entitled: true });
    guard = new EntitlementGuard(reflector, entitlements);
  });

  it("is a true no-op before actor loads when entitlement metadata is absent", async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined);
    const context = contextFor(null);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_ENTITLEMENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(usersRepo.getById).not.toHaveBeenCalled();
    expect(entitlements.canUseFeature).not.toHaveBeenCalled();
  });

  it("allows an active actor through the always-entitled implementation", async () => {
    const alwaysEntitledGuard = new EntitlementGuard(reflector, new AlwaysEntitledService());

    await expect(alwaysEntitledGuard.canActivate(contextFor())).resolves.toBe(true);

    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
  });

  it("denies a suspended actor through the always-entitled implementation", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(
      userRow({ globalStatus: GLOBAL_STATUS.SUSPENDED }),
    );
    const alwaysEntitledGuard = new EntitlementGuard(reflector, new AlwaysEntitledService());

    await expectCoreError(
      () => alwaysEntitledGuard.canActivate(contextFor()),
      ErrorType.NotEntitled,
    );
  });

  it("passes the current row and requested feature as the exact entitlement query", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(
      userRow({ id: "current-user", globalStatus: GLOBAL_STATUS.PENDING }),
    );
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(ENTITLEMENT_FEATURE.REVIEW_READ);

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);

    expect(entitlements.canUseFeature).toHaveBeenCalledOnce();
    expect(entitlements.canUseFeature).toHaveBeenCalledWith({
      userId: "current-user",
      globalStatus: GLOBAL_STATUS.PENDING,
      feature: ENTITLEMENT_FEATURE.REVIEW_READ,
    });
  });

  it("maps a custom service denial and reason to the exact NotEntitled contract", async () => {
    entitlements.canUseFeature.mockResolvedValue({
      entitled: false,
      reason: "custom subscription reason",
    });

    await expectCoreError(() => guard.canActivate(contextFor()), ErrorType.NotEntitled);

    expect(ErrorType.NotEntitled).toEqual({
      code: "not_entitled",
      statusCode: 403,
      message: "Your plan does not include this feature.",
    });
  });

  it("prefers handler entitlement metadata over class metadata", async () => {
    const context = contextFor();
    RequireEntitlement(ENTITLEMENT_FEATURE.REPO_ACTIVATION)(context.getClass());
    RequireEntitlement(ENTITLEMENT_FEATURE.COMMENT)(context.getHandler());
    guard = new EntitlementGuard(new Reflector(), entitlements);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(entitlements.canUseFeature).toHaveBeenCalledWith({
      userId: "user-1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
      feature: ENTITLEMENT_FEATURE.COMMENT,
    });
  });

  it("returns Unauthorized when entitlement metadata exists but the session actor is missing", async () => {
    await expectCoreError(() => guard.canActivate(contextFor(null)), ErrorType.Unauthorized);

    expect(usersRepo.getById).not.toHaveBeenCalled();
    expect(entitlements.canUseFeature).not.toHaveBeenCalled();
  });

  it("returns Unauthorized when the current database actor is missing", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(null);

    await expectCoreError(() => guard.canActivate(contextFor()), ErrorType.Unauthorized);

    expect(usersRepo.getById).toHaveBeenCalledWith("user-1");
    expect(entitlements.canUseFeature).not.toHaveBeenCalled();
  });
});
