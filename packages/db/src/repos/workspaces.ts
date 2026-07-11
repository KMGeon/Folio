import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type WorkspaceInsert, type WorkspaceRow, workspaces } from "../schema/workspaces.js";

export const workspacesRepo = {
  async create(input: WorkspaceInsert, db: Db = getDb()): Promise<WorkspaceRow> {
    const [row] = await db.insert(workspaces).values(input).returning();
    if (!row) {
      throw new Error("workspacesRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<WorkspaceRow | null> {
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return row ?? null;
  },

  async getByGithubAccountId(
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<WorkspaceRow | null> {
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.githubAccountId, githubAccountId))
      .limit(1);
    return row ?? null;
  },

  async getByGithubAccountIdForUpdate(
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<WorkspaceRow | null> {
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.githubAccountId, githubAccountId))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async upsertByGithubAccountId(input: WorkspaceInsert, db: Db = getDb()): Promise<WorkspaceRow> {
    const [row] = await db
      .insert(workspaces)
      .values(input)
      .onConflictDoUpdate({
        target: workspaces.githubAccountId,
        set: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("workspacesRepo.upsertByGithubAccountId: insert returned no row");
    }
    return row;
  },
};
