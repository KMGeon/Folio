import { asc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type FoliantMessageInsert,
  type FoliantMessageRow,
  type FoliantThreadInsert,
  type FoliantThreadRow,
  foliantMessages,
  foliantThreads,
} from "../schema/foliant.js";

export const foliantRepo = {
  async createThread(input: FoliantThreadInsert, db: Db = getDb()): Promise<FoliantThreadRow> {
    const [row] = await db.insert(foliantThreads).values(input).returning();
    if (!row) {
      throw new Error("foliantRepo.createThread: insert returned no row");
    }
    return row;
  },

  async getThread(id: string, db: Db = getDb()): Promise<FoliantThreadRow | null> {
    const [row] = await db.select().from(foliantThreads).where(eq(foliantThreads.id, id)).limit(1);
    return row ?? null;
  },

  async listThreadsByPr(prId: string, db: Db = getDb()): Promise<FoliantThreadRow[]> {
    return db.select().from(foliantThreads).where(eq(foliantThreads.prId, prId));
  },

  async addMessage(input: FoliantMessageInsert, db: Db = getDb()): Promise<FoliantMessageRow> {
    const [row] = await db.insert(foliantMessages).values(input).returning();
    if (!row) {
      throw new Error("foliantRepo.addMessage: insert returned no row");
    }
    return row;
  },

  async listMessages(threadId: string, db: Db = getDb()): Promise<FoliantMessageRow[]> {
    return db
      .select()
      .from(foliantMessages)
      .where(eq(foliantMessages.threadId, threadId))
      .orderBy(asc(foliantMessages.createdAt));
  },
};
