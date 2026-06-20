import { asc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type ChapterInsert, type ChapterRow, chapters } from "../schema/chapters.js";

export const chaptersRepo = {
  /**
   * Replace all chapters for a revision in a single transaction (delete then
   * insert), so a re-chapter run atomically swaps the set. jsonb fields
   * (`hunkRefs`/`keyChanges`/`reviewHints`/`risks`) round-trip faithfully.
   */
  async replaceForRevision(
    revisionId: string,
    rows: ChapterInsert[],
    db: Db = getDb(),
  ): Promise<ChapterRow[]> {
    return db.transaction(async (tx) => {
      await tx.delete(chapters).where(eq(chapters.revisionId, revisionId));
      if (rows.length === 0) {
        return [];
      }
      return tx
        .insert(chapters)
        .values(rows.map((r) => ({ ...r, revisionId })))
        .returning();
    });
  },

  async listByRevision(revisionId: string, db: Db = getDb()): Promise<ChapterRow[]> {
    return db
      .select()
      .from(chapters)
      .where(eq(chapters.revisionId, revisionId))
      .orderBy(asc(chapters.order));
  },

  async getById(id: string, db: Db = getDb()): Promise<ChapterRow | null> {
    const [row] = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
    return row ?? null;
  },
};
