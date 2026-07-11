import { GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type UserInsert, type UserRow, USER_STATUS, users } from "../schema/users.js";

export const usersRepo = {
  async create(input: UserInsert, db: Db = getDb()): Promise<UserRow> {
    const [row] = await db.insert(users).values(input).returning();
    if (!row) {
      throw new Error("usersRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  },

  async getByIdForUpdate(id: string, db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    return row ?? null;
  },

  async getByIdsForUpdate(userIds: string[], db: Db = getDb()): Promise<UserRow[]> {
    const orderedUserIds = [...new Set(userIds)].sort();
    if (orderedUserIds.length === 0) {
      return [];
    }

    // All global-user mutations share this order so overlapping authority locks cannot deadlock.
    return db
      .select()
      .from(users)
      .where(inArray(users.id, orderedUserIds))
      .orderBy(asc(users.id))
      .for("update");
  },

  async getByGithubId(githubUserId: number, db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.githubUserId, githubUserId))
      .limit(1);
    return row ?? null;
  },

  async upsertByGithubId(input: UserInsert, db: Db = getDb()): Promise<UserRow> {
    const [row] = await db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        target: users.githubUserId,
        set: {
          login: input.login,
          avatarUrl: input.avatarUrl,
          email: input.email ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("usersRepo.upsertByGithubId: insert returned no row");
    }
    return row;
  },

  async listAll(db: Db = getDb()): Promise<UserRow[]> {
    return db.select().from(users).orderBy(asc(users.createdAt));
  },

  async setGlobalStatus(
    id: string,
    globalStatus: GlobalStatus,
    db: Db = getDb(),
  ): Promise<UserRow | null> {
    const [row] = await db
      .update(users)
      .set({ globalStatus, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  },

  async setGlobalStatusIfCurrent(
    id: string,
    expectedGlobalStatus: GlobalStatus,
    globalStatus: GlobalStatus,
    db: Db = getDb(),
    conditions: { expectedIsSystemAdmin?: boolean } = {},
  ): Promise<UserRow | null> {
    // The optional role predicate closes promotion-vs-suspension races at the write boundary.
    const [row] = await db
      .update(users)
      .set({ globalStatus, updatedAt: new Date() })
      .where(
        and(
          eq(users.id, id),
          eq(users.globalStatus, expectedGlobalStatus),
          ne(users.globalStatus, globalStatus),
          conditions.expectedIsSystemAdmin === undefined
            ? undefined
            : eq(users.isSystemAdmin, conditions.expectedIsSystemAdmin),
        ),
      )
      .returning();
    return row ?? null;
  },

  async getSystemAdmin(db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.isSystemAdmin, true)).limit(1);
    return row ?? null;
  },

  async setSystemAdmin(id: string, value: boolean, db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db
      .update(users)
      .set({ isSystemAdmin: value, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  },

  async setSystemAdminIfCurrent(
    id: string,
    expectedValue: boolean,
    expectedGlobalStatus: GlobalStatus,
    value: boolean,
    db: Db = getDb(),
  ): Promise<UserRow | null> {
    // Authority transfer depends on both role and active lifecycle state remaining current.
    const [row] = await db
      .update(users)
      .set({ isSystemAdmin: value, updatedAt: new Date() })
      .where(
        and(
          eq(users.id, id),
          eq(users.isSystemAdmin, expectedValue),
          eq(users.globalStatus, expectedGlobalStatus),
          ne(users.isSystemAdmin, value),
        ),
      )
      .returning();
    return row ?? null;
  },

  async bootstrapInitialSystemAdmin(
    githubUserId: number,
    db: Db = getDb(),
  ): Promise<UserRow | null> {
    return db.transaction(async (tx) => {
      // Serialize the one-time seed across all configured identities before checking authority.
      await tx.execute(sql`select pg_advisory_xact_lock(464650, 15)`);
      const transactionDb = tx as Db;
      const existingAdmin = await usersRepo.getSystemAdmin(transactionDb);
      if (existingAdmin) {
        return null;
      }

      const user = await usersRepo.getByGithubId(githubUserId, transactionDb);
      if (!user) {
        return null;
      }

      const active = await usersRepo.setGlobalStatus(user.id, GLOBAL_STATUS.ACTIVE, transactionDb);
      if (!active) {
        throw new Error("usersRepo.bootstrapInitialSystemAdmin: activation returned no row");
      }

      const admin = await usersRepo.setSystemAdmin(user.id, true, transactionDb);
      if (!admin) {
        throw new Error("usersRepo.bootstrapInitialSystemAdmin: promotion returned no row");
      }
      return admin;
    });
  },

  async listPending(db: Db = getDb()): Promise<UserRow[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.status, USER_STATUS.PENDING))
      .orderBy(asc(users.createdAt));
  },

  async approve(id: string, db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db
      .update(users)
      .set({
        status: USER_STATUS.APPROVED,
        globalStatus: GLOBAL_STATUS.ACTIVE,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, id),
          eq(users.status, USER_STATUS.PENDING),
          eq(users.globalStatus, GLOBAL_STATUS.PENDING),
        ),
      )
      .returning();
    return row ?? null;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  },
};
