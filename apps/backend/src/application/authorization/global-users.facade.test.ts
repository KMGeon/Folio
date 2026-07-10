import { type AuditLogRow, type UserRow, auditLogsRepo, usersRepo } from "@folio/db";
import { AUDIT_ACTION, GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { GlobalUsersFacade } from "./global-users.facade.js";

const dbDouble = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@folio/db", () => ({
  auditLogsRepo: { record: vi.fn() },
  getDb: () => ({ transaction: dbDouble.transaction }),
  usersRepo: {
    getById: vi.fn(),
    listAll: vi.fn(),
    setGlobalStatusIfCurrent: vi.fn(),
    setSystemAdminIfCurrent: vi.fn(),
  },
}));

const transactionHandle = { kind: "transaction" };
const now = new Date("2026-07-11T00:00:00.000Z");

function user(id: string, globalStatus: GlobalStatus, isSystemAdmin = false): UserRow {
  return {
    id,
    githubUserId: id === "admin-1" ? 1 : 2,
    login: `${id}-login`,
    avatarUrl: `https://avatars.example/${id}`,
    email: `${id}@example.com`,
    status: "approved",
    globalStatus,
    isSystemAdmin,
    createdAt: now,
    updatedAt: now,
  };
}

function auditRow(input: Parameters<typeof auditLogsRepo.record>[0]): AuditLogRow {
  return {
    id: "audit-1",
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    workspaceId: input.workspaceId ?? null,
    before: input.before,
    after: input.after,
    createdAt: now,
    updatedAt: now,
  };
}

function expectCoreError(error: unknown, errorType: (typeof ErrorType)[keyof typeof ErrorType]) {
  expect(error).toBeInstanceOf(CoreException);
  expect((error as CoreException).errorType).toBe(errorType);
}

describe("GlobalUsersFacade", () => {
  let facade: GlobalUsersFacade;

  beforeEach(() => {
    vi.resetAllMocks();
    dbDouble.transaction.mockImplementation(async (callback) => callback(transactionHandle));
    facade = new GlobalUsersFacade();
  });

  it("lists every global user", async () => {
    const rows = [user("admin-1", GLOBAL_STATUS.ACTIVE, true)];
    vi.mocked(usersRepo.listAll).mockResolvedValue(rows);

    await expect(facade.list()).resolves.toBe(rows);
  });

  describe.each([
    ["approve", GLOBAL_STATUS.PENDING, GLOBAL_STATUS.ACTIVE, AUDIT_ACTION.USER_APPROVE],
    ["suspend", GLOBAL_STATUS.ACTIVE, GLOBAL_STATUS.SUSPENDED, AUDIT_ACTION.USER_SUSPEND],
  ] as const)("%s", (operation, fromStatus, toStatus, action) => {
    it(`moves ${fromStatus} to ${toStatus} and records the exact audit atomically`, async () => {
      const before = user("user-1", fromStatus);
      const after = user("user-1", toStatus);
      vi.mocked(usersRepo.getById).mockResolvedValue(before);
      vi.mocked(usersRepo.setGlobalStatusIfCurrent).mockResolvedValue(after);
      vi.mocked(auditLogsRepo.record).mockImplementation(async (input) => auditRow(input));

      await facade[operation]({ actorUserId: "admin-1", targetUserId: "user-1" });

      expect(usersRepo.getById).toHaveBeenCalledWith("user-1", transactionHandle);
      if (operation === "suspend") {
        expect(usersRepo.setGlobalStatusIfCurrent).toHaveBeenCalledWith(
          "user-1",
          fromStatus,
          toStatus,
          transactionHandle,
          { expectedIsSystemAdmin: false },
        );
      } else {
        expect(usersRepo.setGlobalStatusIfCurrent).toHaveBeenCalledWith(
          "user-1",
          fromStatus,
          toStatus,
          transactionHandle,
        );
      }
      expect(auditLogsRepo.record).toHaveBeenCalledWith(
        {
          actorUserId: "admin-1",
          action,
          targetType: "user",
          targetId: "user-1",
          workspaceId: null,
          before: { globalStatus: fromStatus },
          after: { globalStatus: toStatus },
        },
        transactionHandle,
      );
    });

    it("throws UserNotFound and never audits a missing target", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(null);

      const error = await facade[operation]({
        actorUserId: "admin-1",
        targetUserId: "missing-1",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.UserNotFound);
      expect(ErrorType.UserNotFound).toEqual({
        code: "user_not_found",
        statusCode: 404,
        message: "User not found.",
      });
      expect(usersRepo.setGlobalStatusIfCurrent).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it("rejects a no-op or invalid source status without a mutation or audit", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user("user-1", toStatus));

      const error = await facade[operation]({
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(usersRepo.setGlobalStatusIfCurrent).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it("rejects a stale conditional update and never emits a false audit", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user("user-1", fromStatus));
      vi.mocked(usersRepo.setGlobalStatusIfCurrent).mockResolvedValue(null);

      const error = await facade[operation]({
        actorUserId: "admin-1",
        targetUserId: "user-1",
      }).catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });
  });

  it("does not suspend the current system admin", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue(user("admin-1", GLOBAL_STATUS.ACTIVE, true));

    const error = await facade
      .suspend({ actorUserId: "admin-1", targetUserId: "admin-1" })
      .catch((caught: unknown) => caught);

    expectCoreError(error, ErrorType.Forbidden);
    expect(usersRepo.setGlobalStatusIfCurrent).not.toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  it("rejects suspend when a concurrent transfer promotes the target before the status CAS", async () => {
    let currentIsSystemAdmin = false;
    vi.mocked(usersRepo.getById).mockImplementation(async () =>
      user("user-1", GLOBAL_STATUS.ACTIVE, currentIsSystemAdmin),
    );
    vi.mocked(usersRepo.setGlobalStatusIfCurrent).mockImplementation(
      async (_id, _expected, _next, _transaction, conditions) => {
        currentIsSystemAdmin = true;
        return conditions?.expectedIsSystemAdmin === currentIsSystemAdmin
          ? user("user-1", GLOBAL_STATUS.SUSPENDED, currentIsSystemAdmin)
          : null;
      },
    );

    const error = await facade
      .suspend({ actorUserId: "admin-1", targetUserId: "user-1" })
      .catch((caught: unknown) => caught);

    expectCoreError(error, ErrorType.Forbidden);
    expect(usersRepo.setGlobalStatusIfCurrent).toHaveBeenCalledWith(
      "user-1",
      GLOBAL_STATUS.ACTIVE,
      GLOBAL_STATUS.SUSPENDED,
      transactionHandle,
      { expectedIsSystemAdmin: false },
    );
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
  });

  describe("transferSystemAdmin", () => {
    function arrangeValidTransfer(): void {
      vi.mocked(usersRepo.getById).mockImplementation(async (id) =>
        id === "admin-1"
          ? user("admin-1", GLOBAL_STATUS.ACTIVE, true)
          : user("user-1", GLOBAL_STATUS.ACTIVE),
      );
      vi.mocked(usersRepo.setSystemAdminIfCurrent)
        .mockResolvedValueOnce(user("admin-1", GLOBAL_STATUS.ACTIVE))
        .mockResolvedValueOnce(user("user-1", GLOBAL_STATUS.ACTIVE, true));
      vi.mocked(auditLogsRepo.record).mockImplementation(async (input) => auditRow(input));
    }

    it("conditionally demotes, promotes, and audits in one transaction", async () => {
      arrangeValidTransfer();

      await facade.transferSystemAdmin({
        actorUserId: "admin-1",
        targetUserId: "user-1",
      });

      expect(usersRepo.getById).toHaveBeenNthCalledWith(1, "admin-1", transactionHandle);
      expect(usersRepo.getById).toHaveBeenNthCalledWith(2, "user-1", transactionHandle);
      expect(usersRepo.setSystemAdminIfCurrent).toHaveBeenNthCalledWith(
        1,
        "admin-1",
        true,
        GLOBAL_STATUS.ACTIVE,
        false,
        transactionHandle,
      );
      expect(usersRepo.setSystemAdminIfCurrent).toHaveBeenNthCalledWith(
        2,
        "user-1",
        false,
        GLOBAL_STATUS.ACTIVE,
        true,
        transactionHandle,
      );
      expect(auditLogsRepo.record).toHaveBeenCalledWith(
        {
          actorUserId: "admin-1",
          action: AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER,
          targetType: "user",
          targetId: "user-1",
          workspaceId: null,
          before: { systemAdminUserId: "admin-1" },
          after: { systemAdminUserId: "user-1" },
        },
        transactionHandle,
      );
    });

    it("rejects self-transfer before opening a transaction", async () => {
      const error = await facade
        .transferSystemAdmin({ actorUserId: "admin-1", targetUserId: "admin-1" })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(dbDouble.transaction).not.toHaveBeenCalled();
    });

    it.each([
      ["actor", "admin-1", null, user("user-1", GLOBAL_STATUS.ACTIVE)],
      ["target", "user-1", user("admin-1", GLOBAL_STATUS.ACTIVE, true), null],
    ] as const)(
      "throws UserNotFound when the %s is missing",
      async (_label, missingId, actor, target) => {
        vi.mocked(usersRepo.getById).mockImplementation(async (id) =>
          id === missingId ? null : id === "admin-1" ? actor : target,
        );

        const error = await facade
          .transferSystemAdmin({ actorUserId: "admin-1", targetUserId: "user-1" })
          .catch((caught: unknown) => caught);

        expectCoreError(error, ErrorType.UserNotFound);
        expect(usersRepo.setSystemAdminIfCurrent).not.toHaveBeenCalled();
        expect(auditLogsRepo.record).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "caller is no longer current admin",
        user("admin-1", GLOBAL_STATUS.ACTIVE, false),
        user("user-1", GLOBAL_STATUS.ACTIVE),
      ],
      [
        "caller is no longer active",
        user("admin-1", GLOBAL_STATUS.SUSPENDED, true),
        user("user-1", GLOBAL_STATUS.ACTIVE),
      ],
      [
        "target is pending",
        user("admin-1", GLOBAL_STATUS.ACTIVE, true),
        user("user-1", GLOBAL_STATUS.PENDING),
      ],
      [
        "target is suspended",
        user("admin-1", GLOBAL_STATUS.ACTIVE, true),
        user("user-1", GLOBAL_STATUS.SUSPENDED),
      ],
      [
        "target is already admin",
        user("admin-1", GLOBAL_STATUS.ACTIVE, true),
        user("user-1", GLOBAL_STATUS.ACTIVE, true),
      ],
    ])("rejects transfer when %s", async (_label, actor, target) => {
      vi.mocked(usersRepo.getById).mockImplementation(async (id) =>
        id === "admin-1" ? actor : target,
      );

      const error = await facade
        .transferSystemAdmin({ actorUserId: "admin-1", targetUserId: "user-1" })
        .catch((caught: unknown) => caught);

      expectCoreError(error, ErrorType.Forbidden);
      expect(usersRepo.setSystemAdminIfCurrent).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it.each(["demote", "promote"] as const)(
      "throws on a stale %s and never writes the transfer audit",
      async (staleStep) => {
        arrangeValidTransfer();
        if (staleStep === "demote") {
          vi.mocked(usersRepo.setSystemAdminIfCurrent).mockReset().mockResolvedValue(null);
        } else {
          vi.mocked(usersRepo.setSystemAdminIfCurrent)
            .mockReset()
            .mockResolvedValueOnce(user("admin-1", GLOBAL_STATUS.ACTIVE))
            .mockResolvedValueOnce(null);
        }

        const error = await facade
          .transferSystemAdmin({ actorUserId: "admin-1", targetUserId: "user-1" })
          .catch((caught: unknown) => caught);

        expectCoreError(error, ErrorType.Forbidden);
        expect(auditLogsRepo.record).not.toHaveBeenCalled();
      },
    );

    it("rolls the demotion back when promotion becomes stale", async () => {
      let adminById = { "admin-1": true, "user-1": false };
      dbDouble.transaction.mockImplementation(async (callback) => {
        const before = { ...adminById };
        try {
          return await callback(transactionHandle);
        } catch (error) {
          adminById = before;
          throw error;
        }
      });
      vi.mocked(usersRepo.getById).mockImplementation(async (id) =>
        user(id, GLOBAL_STATUS.ACTIVE, adminById[id as keyof typeof adminById]),
      );
      vi.mocked(usersRepo.setSystemAdminIfCurrent).mockImplementation(
        async (id, expected, _status, value) => {
          const key = id as keyof typeof adminById;
          if (id === "user-1" || adminById[key] !== expected) {
            return null;
          }
          adminById[key] = value;
          return user(id, GLOBAL_STATUS.ACTIVE, value);
        },
      );

      await expect(
        facade.transferSystemAdmin({ actorUserId: "admin-1", targetUserId: "user-1" }),
      ).rejects.toBeInstanceOf(CoreException);
      expect(adminById).toEqual({ "admin-1": true, "user-1": false });
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });
  });
});
