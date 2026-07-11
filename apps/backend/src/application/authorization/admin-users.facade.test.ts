import { type UserRow, adminUsersRepo } from "@folio/db";
import { GLOBAL_STATUS } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArgumentsHost } from "@nestjs/common";
import type { LoggerPort } from "../../internal/logger/logger.port.js";
import { CoreException } from "../../support/error/core-exception.js";
import { CoreExceptionFilter } from "../../support/error/core-exception.filter.js";
import { ErrorType } from "../../support/error/error-type.js";
import { decodeAdminPageCursor } from "./admin-page-cursor.js";
import { AdminUsersFacade } from "./admin-users.facade.js";
import type { GlobalUsersFacade } from "./global-users.facade.js";

vi.mock("@folio/db", () => ({ adminUsersRepo: { list: vi.fn() } }));

const createdAt = new Date("2026-07-11T03:04:05.000Z");
const id = "123e4567-e89b-42d3-a456-426614174000";

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id,
    githubUserId: 1,
    login: "octocat",
    avatarUrl: "https://avatars.example/octocat",
    email: "octocat@example.com",
    status: "approved",
    globalStatus: GLOBAL_STATUS.ACTIVE,
    isSystemAdmin: false,
    createdAt,
    updatedAt: new Date("2026-07-11T04:00:00.000Z"),
    ...overrides,
  };
}

describe("AdminUsersFacade", () => {
  const commands = {
    approve: vi.fn(),
    suspend: vi.fn(),
    transferSystemAdmin: vi.fn(),
  };
  const facade = new AdminUsersFacade(commands as unknown as GlobalUsersFacade);

  beforeEach(() => vi.resetAllMocks());

  it("maps all status to no DB filter and emits no cursor at the end", async () => {
    vi.mocked(adminUsersRepo.list).mockResolvedValue({ items: [user()], hasMore: false });

    await expect(facade.list({ limit: 25, status: "all", q: "octo" })).resolves.toEqual({
      items: [
        {
          id,
          login: "octocat",
          avatarUrl: "https://avatars.example/octocat",
          email: "octocat@example.com",
          globalStatus: GLOBAL_STATUS.ACTIVE,
          isSystemAdmin: false,
          createdAt: createdAt.toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(adminUsersRepo.list).toHaveBeenCalledWith({
      limit: 25,
      q: "octo",
      status: undefined,
      cursor: undefined,
    });
  });

  it("decodes the incoming cursor and encodes the last returned row only when more exist", async () => {
    const first = user({ id: "223e4567-e89b-42d3-a456-426614174000" });
    const last = user({ id: "323e4567-e89b-42d3-a456-426614174000" });
    const incoming = Buffer.from(
      JSON.stringify({ v: 1, createdAt: createdAt.toISOString(), id }),
    ).toString("base64url");
    vi.mocked(adminUsersRepo.list).mockResolvedValue({ items: [first, last], hasMore: true });

    const page = await facade.list({ limit: 2, status: "pending", cursor: incoming });

    expect(adminUsersRepo.list).toHaveBeenCalledWith({
      limit: 2,
      q: undefined,
      status: GLOBAL_STATUS.PENDING,
      cursor: { createdAt, id },
    });
    expect(decodeAdminPageCursor(page.nextCursor ?? undefined)).toEqual({
      createdAt: last.createdAt,
      id: last.id,
    });
  });

  it.each(["approve", "suspend", "transferSystemAdmin"] as const)(
    "delegates %s to the existing command facade",
    async (operation) => {
      const command = { actorUserId: "admin-1", targetUserId: id };

      await facade[operation](command);

      expect(commands[operation]).toHaveBeenCalledWith(command);
    },
  );

  it("preserves UserNotFound from the command facade as a 404", async () => {
    commands.approve.mockRejectedValue(new CoreException(ErrorType.UserNotFound));

    const error = await facade
      .approve({ actorUserId: "admin-1", targetUserId: "missing" })
      .catch((caught: unknown) => caught);

    expect((error as CoreException).errorType).toBe(ErrorType.UserNotFound);
    expect((error as CoreException).errorType.statusCode).toBe(404);

    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/api/v1/admin/users/missing/approve" }),
        getResponse: () => ({ status, json }),
      }),
    } as unknown as ArgumentsHost;
    const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    new CoreExceptionFilter(logger).catch(error, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: "user_not_found", message: "User not found." },
      }),
    );
  });
});
