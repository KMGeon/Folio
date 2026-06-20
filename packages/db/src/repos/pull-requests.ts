import { and, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type PullRequestInsert,
  type PullRequestRow,
  pullRequests,
} from "../schema/pull-requests.js";

export const pullRequestsRepo = {
  async create(input: PullRequestInsert, db: Db = getDb()): Promise<PullRequestRow> {
    const [row] = await db.insert(pullRequests).values(input).returning();
    if (!row) {
      throw new Error("pullRequestsRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<PullRequestRow | null> {
    const [row] = await db.select().from(pullRequests).where(eq(pullRequests.id, id)).limit(1);
    return row ?? null;
  },

  async getByRepoAndNumber(
    repoId: string,
    githubPrNumber: number,
    db: Db = getDb(),
  ): Promise<PullRequestRow | null> {
    const [row] = await db
      .select()
      .from(pullRequests)
      .where(and(eq(pullRequests.repoId, repoId), eq(pullRequests.githubPrNumber, githubPrNumber)))
      .limit(1);
    return row ?? null;
  },

  async listByRepo(repoId: string, db: Db = getDb()): Promise<PullRequestRow[]> {
    return db.select().from(pullRequests).where(eq(pullRequests.repoId, repoId));
  },

  async upsertByRepoAndNumber(input: PullRequestInsert, db: Db = getDb()): Promise<PullRequestRow> {
    const [row] = await db
      .insert(pullRequests)
      .values(input)
      .onConflictDoUpdate({
        target: [pullRequests.repoId, pullRequests.githubPrNumber],
        set: {
          title: input.title,
          body: input.body ?? null,
          authorLogin: input.authorLogin,
          baseRef: input.baseRef,
          headRef: input.headRef,
          headSha: input.headSha,
          status: input.status,
          htmlUrl: input.htmlUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("pullRequestsRepo.upsertByRepoAndNumber: insert returned no row");
    }
    return row;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(pullRequests).where(eq(pullRequests.id, id));
  },
};
