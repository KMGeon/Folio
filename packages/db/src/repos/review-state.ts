import { and, eq, gte, sql } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { chapters } from "../schema/chapters.js";
import { chapterReviewState, fileReviewState } from "../schema/review-state.js";

export const reviewStateRepo = {
  /** Mark a file viewed for (user, revision, filePath). Idempotent. */
  async markFileViewed(
    p: { userId: string; revisionId: string; filePath: string },
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .insert(fileReviewState)
      .values({ userId: p.userId, revisionId: p.revisionId, filePath: p.filePath })
      .onConflictDoUpdate({
        target: [fileReviewState.userId, fileReviewState.revisionId, fileReviewState.filePath],
        set: { viewedAt: new Date(), updatedAt: new Date() },
      });
  },

  /** Remove a file's viewed mark (auto-unmark when the file changes). */
  async unmarkFileViewed(
    p: { userId: string; revisionId: string; filePath: string },
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .delete(fileReviewState)
      .where(
        and(
          eq(fileReviewState.userId, p.userId),
          eq(fileReviewState.revisionId, p.revisionId),
          eq(fileReviewState.filePath, p.filePath),
        ),
      );
  },

  /** Mark a chapter viewed for (user, chapter). Idempotent. */
  async markChapterViewed(
    p: { userId: string; chapterId: string; revisionId: string },
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .insert(chapterReviewState)
      .values({ userId: p.userId, chapterId: p.chapterId, revisionId: p.revisionId })
      .onConflictDoUpdate({
        target: [chapterReviewState.userId, chapterReviewState.chapterId],
        set: { viewedAt: new Date(), updatedAt: new Date() },
      });
  },

  /** Remove a chapter's viewed mark. */
  async unmarkChapterViewed(
    p: { userId: string; chapterId: string },
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .delete(chapterReviewState)
      .where(
        and(eq(chapterReviewState.userId, p.userId), eq(chapterReviewState.chapterId, p.chapterId)),
      );
  },

  /**
   * Chapter-level review progress for a (user, revision): how many of the
   * revision's chapters the user has marked viewed, over the total.
   */
  async progressForRevision(
    userId: string,
    revisionId: string,
    db: Db = getDb(),
  ): Promise<{ viewed: number; total: number }> {
    const [totalRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(chapters)
      .where(eq(chapters.revisionId, revisionId));
    const [viewedRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(chapterReviewState)
      .where(
        and(eq(chapterReviewState.userId, userId), eq(chapterReviewState.revisionId, revisionId)),
      );
    return { viewed: viewedRow?.count ?? 0, total: totalRow?.count ?? 0 };
  },

  /** Rollup of viewed file paths and chapter ids for (user, revision). */
  async viewedForRevision(
    userId: string,
    revisionId: string,
    db: Db = getDb(),
  ): Promise<{ filePaths: string[]; chapterIds: string[] }> {
    const files = await db
      .select({ filePath: fileReviewState.filePath })
      .from(fileReviewState)
      .where(and(eq(fileReviewState.userId, userId), eq(fileReviewState.revisionId, revisionId)));
    const chs = await db
      .select({ chapterId: chapterReviewState.chapterId })
      .from(chapterReviewState)
      .where(
        and(eq(chapterReviewState.userId, userId), eq(chapterReviewState.revisionId, revisionId)),
      );
    return {
      filePaths: files.map((f) => f.filePath),
      chapterIds: chs.map((c) => c.chapterId),
    };
  },

  /**
   * Daily count of chapters a user marked viewed over the last `sinceDays`,
   * for the dashboard activity heatmap. Returns only days with activity.
   */
  async viewCountsByDay(
    userId: string,
    sinceDays = 365,
    db: Db = getDb(),
  ): Promise<{ date: string; count: number }[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    return db
      .select({
        date: sql<string>`to_char(${chapterReviewState.viewedAt}, 'YYYY-MM-DD')`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(chapterReviewState)
      .where(and(eq(chapterReviewState.userId, userId), gte(chapterReviewState.viewedAt, since)))
      .groupBy(sql`1`);
  },
};
