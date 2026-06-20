import { asc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type RevisionInsert, type RevisionRow, revisions } from "../schema/revisions.js";

export const revisionsRepo = {
  async create(input: RevisionInsert, db: Db = getDb()): Promise<RevisionRow> {
    const [row] = await db.insert(revisions).values(input).returning();
    if (!row) {
      throw new Error("revisionsRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<RevisionRow | null> {
    const [row] = await db.select().from(revisions).where(eq(revisions.id, id)).limit(1);
    return row ?? null;
  },

  async listByPr(prId: string, db: Db = getDb()): Promise<RevisionRow[]> {
    return db
      .select()
      .from(revisions)
      .where(eq(revisions.prId, prId))
      .orderBy(asc(revisions.index));
  },

  async latestForPr(prId: string, db: Db = getDb()): Promise<RevisionRow | null> {
    const rows = await this.listByPr(prId, db);
    return rows.at(-1) ?? null;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(revisions).where(eq(revisions.id, id));
  },
};
