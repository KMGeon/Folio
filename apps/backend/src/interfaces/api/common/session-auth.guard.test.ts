import { type UserRow, USER_STATUS, usersRepo } from "@folio/db";
import type { usersRepo as DbUsersRepo } from "@folio/db";
import { GLOBAL_STATUS } from "@folio/types";
import type { ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionService } from "../../../domain/auth/session.service.js";
import type { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

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

const sessions = {
  resolve: vi.fn(),
} as unknown as SessionService;

const now = new Date("2026-07-11T00:00:00.000Z");

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "u1",
    githubUserId: 42,
    login: "octocat",
    avatarUrl: "https://avatars.example/octocat",
    email: null,
    status: USER_STATUS.APPROVED,
    globalStatus: GLOBAL_STATUS.ACTIVE,
    isSystemAdmin: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function contextWithCookie(token = "cookie-token") {
  const request = { cookies: { folio_session: token } };
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

describe("SessionAuthGuard", () => {
  let guard: SessionAuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new SessionAuthGuard(sessions);
    vi.mocked(sessions.resolve).mockResolvedValue({ userId: "u1" });
  });

  it("authenticates an active user even while the legacy status is pending", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(
      userRow({ status: USER_STATUS.PENDING, globalStatus: GLOBAL_STATUS.ACTIVE }),
    );
    const { context, request } = contextWithCookie();

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(sessions.resolve).toHaveBeenCalledWith("cookie-token");
    expect(usersRepo.getById).toHaveBeenCalledWith("u1");
    expect(request).toMatchObject({
      user: { id: "u1", login: "octocat", avatarUrl: "https://avatars.example/octocat" },
    });
  });

  it.each([GLOBAL_STATUS.PENDING, GLOBAL_STATUS.SUSPENDED])(
    "rejects a %s user even while the legacy status is approved",
    async (globalStatus) => {
      vi.mocked(usersRepo.getById).mockResolvedValue(userRow({ globalStatus }));

      await expect(guard.canActivate(contextWithCookie().context)).rejects.toMatchObject({
        errorType: ErrorType.Unauthorized,
      } satisfies Partial<CoreException>);
    },
  );

  it("rejects a session whose current user row is missing", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(null);

    await expect(guard.canActivate(contextWithCookie().context)).rejects.toMatchObject({
      errorType: ErrorType.Unauthorized,
    } satisfies Partial<CoreException>);
  });
});
