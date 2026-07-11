import { GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_STATUS } from "../schema/users.js";
import { usersRepo } from "./users.js";

const transactionDb = { execute: vi.fn() };
const db = {
  transaction: vi.fn(async (run: (tx: typeof transactionDb) => Promise<unknown>) =>
    run(transactionDb),
  ),
};

describe("usersRepo.bootstrapInitialSystemAdmin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("serializes and activates then promotes with the same transaction handle", async () => {
    const pending = { id: "u1", githubUserId: 42, globalStatus: GLOBAL_STATUS.PENDING };
    const active = { ...pending, globalStatus: GLOBAL_STATUS.ACTIVE };
    const admin = { ...active, isSystemAdmin: true };
    const getAdmin = vi.spyOn(usersRepo, "getSystemAdmin").mockResolvedValue(null);
    const getUser = vi.spyOn(usersRepo, "getByGithubId").mockResolvedValue(pending as never);
    const activate = vi.spyOn(usersRepo, "setGlobalStatus").mockResolvedValue(active as never);
    const promote = vi.spyOn(usersRepo, "setSystemAdmin").mockResolvedValue(admin as never);

    await expect(usersRepo.bootstrapInitialSystemAdmin(42, db as never)).resolves.toEqual(admin);

    expect(transactionDb.execute).toHaveBeenCalledOnce();
    expect(getAdmin).toHaveBeenCalledWith(transactionDb);
    expect(getUser).toHaveBeenCalledWith(42, transactionDb);
    expect(activate).toHaveBeenCalledWith("u1", GLOBAL_STATUS.ACTIVE, transactionDb);
    expect(promote).toHaveBeenCalledWith("u1", true, transactionDb);
    expect(activate.mock.invocationCallOrder[0]).toBeLessThan(promote.mock.invocationCallOrder[0]!);
  });

  it("does not mutate when an admin already exists", async () => {
    vi.spyOn(usersRepo, "getSystemAdmin").mockResolvedValue({ id: "admin" } as never);
    const getUser = vi.spyOn(usersRepo, "getByGithubId");
    const activate = vi.spyOn(usersRepo, "setGlobalStatus");
    const promote = vi.spyOn(usersRepo, "setSystemAdmin");

    await expect(usersRepo.bootstrapInitialSystemAdmin(42, db as never)).resolves.toBeNull();

    expect(getUser).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it("does not mutate when the matching user is missing", async () => {
    vi.spyOn(usersRepo, "getSystemAdmin").mockResolvedValue(null);
    vi.spyOn(usersRepo, "getByGithubId").mockResolvedValue(null);
    const activate = vi.spyOn(usersRepo, "setGlobalStatus");
    const promote = vi.spyOn(usersRepo, "setSystemAdmin");

    await expect(usersRepo.bootstrapInitialSystemAdmin(42, db as never)).resolves.toBeNull();

    expect(activate).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it("throws on a stale activation so the transaction can roll back", async () => {
    vi.spyOn(usersRepo, "getSystemAdmin").mockResolvedValue(null);
    vi.spyOn(usersRepo, "getByGithubId").mockResolvedValue({ id: "u1" } as never);
    vi.spyOn(usersRepo, "setGlobalStatus").mockResolvedValue(null);
    const promote = vi.spyOn(usersRepo, "setSystemAdmin");

    await expect(usersRepo.bootstrapInitialSystemAdmin(42, db as never)).rejects.toThrow(
      "activation returned no row",
    );
    expect(promote).not.toHaveBeenCalled();
  });

  it("throws on a stale promotion so activation cannot commit alone", async () => {
    let storedStatus: GlobalStatus = GLOBAL_STATUS.PENDING;
    const rollbackDb = {
      transaction: async (run: (tx: typeof transactionDb) => Promise<unknown>) => {
        const initialStatus = storedStatus;
        try {
          return await run(transactionDb);
        } catch (error) {
          storedStatus = initialStatus;
          throw error;
        }
      },
    };
    vi.spyOn(usersRepo, "getSystemAdmin").mockResolvedValue(null);
    vi.spyOn(usersRepo, "getByGithubId").mockResolvedValue({ id: "u1" } as never);
    vi.spyOn(usersRepo, "setGlobalStatus").mockImplementation(async () => {
      storedStatus = GLOBAL_STATUS.ACTIVE;
      return { id: "u1", globalStatus: storedStatus } as never;
    });
    vi.spyOn(usersRepo, "setSystemAdmin").mockResolvedValue(null);

    await expect(usersRepo.bootstrapInitialSystemAdmin(42, rollbackDb as never)).rejects.toThrow(
      "promotion returned no row",
    );
    expect(storedStatus).toBe(GLOBAL_STATUS.PENDING);
  });
});

describe("usersRepo.approve", () => {
  it("updates only a legacy-pending and globally-pending user", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    await expect(usersRepo.approve("u1", { update } as never)).resolves.toBeNull();

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: USER_STATUS.APPROVED,
        globalStatus: GLOBAL_STATUS.ACTIVE,
      }),
    );
    const predicate = where.mock.calls[0]?.[0];
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.sql).toContain('"users"."id" = $1');
    expect(query.sql).toContain('"users"."status" = $2');
    expect(query.sql).toContain('"users"."global_status" = $3');
    expect(query.params).toEqual(["u1", USER_STATUS.PENDING, GLOBAL_STATUS.PENDING]);
  });
});

describe("usersRepo conditional global authorization transitions", () => {
  it("locks one user row for an authority-sensitive transaction", async () => {
    const forUpdate = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ for: forUpdate });
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    await expect(usersRepo.getByIdForUpdate("u1", { select } as never)).resolves.toBeNull();

    expect(forUpdate).toHaveBeenCalledWith("update");
  });

  it("updates global status only from the expected current status", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    await expect(
      usersRepo.setGlobalStatusIfCurrent("u1", GLOBAL_STATUS.PENDING, GLOBAL_STATUS.ACTIVE, {
        update,
      } as never),
    ).resolves.toBeNull();

    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"users"."id" = $1');
    expect(query.sql).toContain('"users"."global_status" = $2');
    expect(query.sql).toContain('"users"."global_status" <> $3');
    expect(query.params).toEqual(["u1", GLOBAL_STATUS.PENDING, GLOBAL_STATUS.ACTIVE]);
  });

  it("updates system-admin authority only for an active row with the expected flag", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    await expect(
      usersRepo.setSystemAdminIfCurrent("u1", true, GLOBAL_STATUS.ACTIVE, false, {
        update,
      } as never),
    ).resolves.toBeNull();

    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"users"."id" = $1');
    expect(query.sql).toContain('"users"."is_system_admin" = $2');
    expect(query.sql).toContain('"users"."global_status" = $3');
    expect(query.sql).toContain('"users"."is_system_admin" <> $4');
    expect(query.params).toEqual(["u1", true, GLOBAL_STATUS.ACTIVE, false]);
  });

  it("optionally gates a global status transition on the current system-admin flag", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    await expect(
      usersRepo.setGlobalStatusIfCurrent(
        "u1",
        GLOBAL_STATUS.ACTIVE,
        GLOBAL_STATUS.SUSPENDED,
        { update } as never,
        { expectedIsSystemAdmin: false },
      ),
    ).resolves.toBeNull();

    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"users"."id" = $1');
    expect(query.sql).toContain('"users"."global_status" = $2');
    expect(query.sql).toContain('"users"."global_status" <> $3');
    expect(query.sql).toContain('"users"."is_system_admin" = $4');
    expect(query.params).toEqual(["u1", GLOBAL_STATUS.ACTIVE, GLOBAL_STATUS.SUSPENDED, false]);
  });
});
