import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type InstallationInsert,
  type InstallationRow,
  installations,
} from "../schema/installations.js";

export const installationsRepo = {
  async create(input: InstallationInsert, db: Db = getDb()): Promise<InstallationRow> {
    const [row] = await db.insert(installations).values(input).returning();
    if (!row) {
      throw new Error("installationsRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<InstallationRow | null> {
    const [row] = await db.select().from(installations).where(eq(installations.id, id)).limit(1);
    return row ?? null;
  },

  async getByIdForUpdate(id: string, db: Db = getDb()): Promise<InstallationRow | null> {
    const [row] = await db
      .select()
      .from(installations)
      .where(eq(installations.id, id))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async getByGithubId(
    githubInstallationId: number,
    db: Db = getDb(),
  ): Promise<InstallationRow | null> {
    const [row] = await db
      .select()
      .from(installations)
      .where(eq(installations.githubInstallationId, githubInstallationId))
      .limit(1);
    return row ?? null;
  },

  async listByAccountLogin(accountLogin: string, db: Db = getDb()): Promise<InstallationRow[]> {
    return db.select().from(installations).where(eq(installations.accountLogin, accountLogin));
  },

  async upsertByGithubId(input: InstallationInsert, db: Db = getDb()): Promise<InstallationRow> {
    const [row] = await db
      .insert(installations)
      .values(input)
      .onConflictDoUpdate({
        target: installations.githubInstallationId,
        set: {
          githubAccountId: input.githubAccountId,
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          suspendedAt: input.suspendedAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("installationsRepo.upsertByGithubId: insert returned no row");
    }
    return row;
  },

  async setGithubAccountId(
    id: string,
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<InstallationRow | null> {
    const [row] = await db
      .update(installations)
      .set({ githubAccountId, updatedAt: new Date() })
      .where(eq(installations.id, id))
      .returning();
    return row ?? null;
  },

  async setSuspendedAt(
    id: string,
    suspendedAt: Date | null,
    db: Db = getDb(),
  ): Promise<InstallationRow | null> {
    const [row] = await db
      .update(installations)
      .set({ suspendedAt, updatedAt: new Date() })
      .where(eq(installations.id, id))
      .returning();
    return row ?? null;
  },

  async listByWorkspaceAccountId(
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<InstallationRow[]> {
    return db
      .select()
      .from(installations)
      .where(eq(installations.githubAccountId, githubAccountId));
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(installations).where(eq(installations.id, id));
  },
};
