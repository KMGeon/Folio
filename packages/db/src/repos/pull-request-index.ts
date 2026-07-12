import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type PullRequestIndexInsert,
  type PullRequestIndexRow,
  pullRequestIndex,
} from "../schema/pull-request-index.js";

export type PullRequestIndexUpsertInput = Omit<
  PullRequestIndexInsert,
  "id" | "createdAt" | "updatedAt"
>;

export const pullRequestIndexRepo = {
  async upsert(input: PullRequestIndexUpsertInput, db: Db = getDb()): Promise<PullRequestIndexRow> {
    const existing = await pullRequestIndexRepo.getByRepoAndNumber(
      input.repoId,
      input.githubPrNumber,
      db,
    );
    // Reject out-of-order webhook deliveries so older events cannot regress the row.
    if (existing && existing.githubUpdatedAt.getTime() > input.githubUpdatedAt.getTime()) {
      return existing;
    }
    if (
      existing &&
      existing.githubUpdatedAt.getTime() === input.githubUpdatedAt.getTime() &&
      existing.headSha === input.headSha &&
      existing.title === input.title &&
      existing.isDraft === input.isDraft &&
      existing.githubState === input.githubState
    ) {
      // Still refresh stats/labels/sync time when the event is same-aged.
    }

    const [row] = await db
      .insert(pullRequestIndex)
      .values(input)
      .onConflictDoUpdate({
        target: [pullRequestIndex.repoId, pullRequestIndex.githubPrNumber],
        set: {
          title: input.title,
          authorLogin: input.authorLogin,
          baseRef: input.baseRef,
          headRef: input.headRef,
          headSha: input.headSha,
          githubState: input.githubState,
          isDraft: input.isDraft,
          mergedAt: input.mergedAt ?? null,
          closedAt: input.closedAt ?? null,
          githubUpdatedAt: input.githubUpdatedAt,
          additions: input.additions ?? 0,
          deletions: input.deletions ?? 0,
          changedFiles: input.changedFiles ?? 0,
          labelsJson: input.labelsJson ?? [],
          htmlUrl: input.htmlUrl,
          lastSyncedAt: input.lastSyncedAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("pullRequestIndexRepo.upsert: insert returned no row");
    }
    return row;
  },

  async getByRepoAndNumber(
    repoId: string,
    githubPrNumber: number,
    db: Db = getDb(),
  ): Promise<PullRequestIndexRow | null> {
    const [row] = await db
      .select()
      .from(pullRequestIndex)
      .where(
        and(
          eq(pullRequestIndex.repoId, repoId),
          eq(pullRequestIndex.githubPrNumber, githubPrNumber),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async listByRepoIds(repoIds: string[], db: Db = getDb()): Promise<PullRequestIndexRow[]> {
    if (repoIds.length === 0) {
      return [];
    }
    return db.select().from(pullRequestIndex).where(inArray(pullRequestIndex.repoId, repoIds));
  },

  async listOpenByRepoIds(repoIds: string[], db: Db = getDb()): Promise<PullRequestIndexRow[]> {
    if (repoIds.length === 0) {
      return [];
    }
    return db
      .select()
      .from(pullRequestIndex)
      .where(
        and(inArray(pullRequestIndex.repoId, repoIds), eq(pullRequestIndex.githubState, "open")),
      );
  },

  async deleteByRepo(repoId: string, db: Db = getDb()): Promise<void> {
    await db.delete(pullRequestIndex).where(eq(pullRequestIndex.repoId, repoId));
  },

  async deleteByRepoAndNumber(
    repoId: string,
    githubPrNumber: number,
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .delete(pullRequestIndex)
      .where(
        and(
          eq(pullRequestIndex.repoId, repoId),
          eq(pullRequestIndex.githubPrNumber, githubPrNumber),
        ),
      );
  },

  /** Drop closed/merged rows older than the retention window (default 97 days). */
  async pruneClosedOlderThan(cutoff: Date, db: Db = getDb()): Promise<number> {
    const result = await db
      .delete(pullRequestIndex)
      .where(
        and(
          eq(pullRequestIndex.githubState, "closed"),
          or(
            and(
              sql`${pullRequestIndex.mergedAt} is not null`,
              lt(pullRequestIndex.mergedAt, cutoff),
            ),
            and(
              sql`${pullRequestIndex.mergedAt} is null`,
              sql`${pullRequestIndex.closedAt} is not null`,
              lt(pullRequestIndex.closedAt, cutoff),
            ),
          ),
        ),
      )
      .returning({ id: pullRequestIndex.id });
    return result.length;
  },
};
