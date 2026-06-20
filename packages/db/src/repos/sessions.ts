import { and, eq, lt } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type SessionInsert, type SessionRow, sessions } from "../schema/sessions.js";

export const sessionsRepo = {
  async create(input: SessionInsert, db: Db = getDb()): Promise<SessionRow> {
    const [row] = await db.insert(sessions).values(input).returning();
    if (!row) {
      throw new Error("sessionsRepo.create: insert returned no row");
    }
    return row;
  },

  async getByTokenHash(tokenHash: string, db: Db = getDb()): Promise<SessionRow | null> {
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },

  async deleteByTokenHash(tokenHash: string, db: Db = getDb()): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  },

  async deleteExpired(now: Date, db: Db = getDb()): Promise<void> {
    await db.delete(sessions).where(and(lt(sessions.expiresAt, now)));
  },
};
