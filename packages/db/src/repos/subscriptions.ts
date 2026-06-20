import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type SubscriptionInsert,
  type SubscriptionRow,
  subscriptions,
} from "../schema/subscriptions.js";

export const subscriptionsRepo = {
  async create(input: SubscriptionInsert, db: Db = getDb()): Promise<SubscriptionRow> {
    const [row] = await db.insert(subscriptions).values(input).returning();
    if (!row) {
      throw new Error("subscriptionsRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<SubscriptionRow | null> {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    return row ?? null;
  },

  async getByAccount(accountId: string, db: Db = getDb()): Promise<SubscriptionRow | null> {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.accountId, accountId))
      .limit(1);
    return row ?? null;
  },

  async update(
    id: string,
    patch: Partial<SubscriptionInsert>,
    db: Db = getDb(),
  ): Promise<SubscriptionRow | null> {
    const [row] = await db
      .update(subscriptions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return row ?? null;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
  },
};
