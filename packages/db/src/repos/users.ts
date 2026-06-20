import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type UserInsert, type UserRow, users } from "../schema/users.js";

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

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  },
};
