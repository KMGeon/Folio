import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type CommentInsert, type CommentRow, comments } from "../schema/comments.js";

export const commentsRepo = {
  async create(input: CommentInsert, db: Db = getDb()): Promise<CommentRow> {
    const [row] = await db.insert(comments).values(input).returning();
    if (!row) {
      throw new Error("commentsRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<CommentRow | null> {
    const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return row ?? null;
  },

  async listByPr(prId: string, db: Db = getDb()): Promise<CommentRow[]> {
    return db.select().from(comments).where(eq(comments.prId, prId));
  },

  async getByGithubCommentId(
    githubCommentId: number,
    db: Db = getDb(),
  ): Promise<CommentRow | null> {
    const [row] = await db
      .select()
      .from(comments)
      .where(eq(comments.githubCommentId, githubCommentId))
      .limit(1);
    return row ?? null;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(comments).where(eq(comments.id, id));
  },
};
