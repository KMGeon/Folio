import type { JobKind, JobPayload, JobStatus } from "@folio/types";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type JobRow, jobs } from "../schema/jobs.js";
import { pullRequests } from "../schema/pull-requests.js";
import { repositories } from "../schema/repositories.js";
import { isAdminJobDistressed, summarizeAdminJobError } from "./admin-job-error-summary.js";

export interface AdminJobCursor {
  createdAt: Date;
  id: string;
}

export interface AdminJobListInput {
  limit: number;
  cursor?: AdminJobCursor;
  status?: JobStatus;
  kind?: JobKind;
  distressed?: boolean;
  jobId?: string;
}

export interface AdminJobRepositoryRef {
  id: string | null;
  fullName: string;
}

export interface AdminJobSummary {
  job: JobRow;
  repository: AdminJobRepositoryRef | null;
  errorSummary: string | null;
  isDistressed: boolean;
}

export interface AdminQueueCounts {
  distressedJobs: number;
  pending: number;
  running: number;
  retrying: number;
  succeededLast24h: number;
  deadLast24h: number;
}

export const adminJobsRepo = {
  async list(input: AdminJobListInput, db: Db = getDb(), now: Date = new Date()) {
    const afterCursor = input.cursor
      ? or(
          lt(jobs.createdAt, input.cursor.createdAt),
          and(eq(jobs.createdAt, input.cursor.createdAt), lt(jobs.id, input.cursor.id)),
        )
      : undefined;
    const distressedFilter = input.distressed
      ? or(eq(jobs.status, "dead"), and(eq(jobs.status, "failed"), lt(jobs.runAfter, now)))
      : undefined;

    const rows = await db
      .select()
      .from(jobs)
      .where(
        and(
          input.jobId ? eq(jobs.id, input.jobId) : undefined,
          input.status ? eq(jobs.status, input.status) : undefined,
          input.kind ? eq(jobs.kind, input.kind) : undefined,
          distressedFilter,
          afterCursor,
        ),
      )
      .orderBy(desc(jobs.createdAt), desc(jobs.id))
      .limit(input.limit + 1);

    const page = rows.slice(0, input.limit);
    return {
      items: await projectRows(page, db, now),
      hasMore: rows.length > input.limit,
    };
  },

  async getById(
    jobId: string,
    db: Db = getDb(),
    now: Date = new Date(),
  ): Promise<AdminJobSummary | null> {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!row) {
      return null;
    }
    const [summary] = await projectRows([row], db, now);
    return summary ?? null;
  },

  async countOverview(db: Db = getDb(), now: Date = new Date()): Promise<AdminQueueCounts> {
    // postgres.js rejects raw Date params in drizzle sql fragments; bind ISO strings.
    const nowIso = now.toISOString();
    const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [row] = await db
      .select({
        distressedJobs: sql<number>`count(*) filter (
          where ${jobs.status} = 'dead'
             or (${jobs.status} = 'failed' and ${jobs.runAfter} < ${nowIso})
        )::int`,
        pending: sql<number>`count(*) filter (where ${jobs.status} = 'pending')::int`,
        running: sql<number>`count(*) filter (
          where ${jobs.status} in ('claimed', 'running')
        )::int`,
        retrying: sql<number>`count(*) filter (
          where ${jobs.status} = 'failed' and ${jobs.runAfter} > ${nowIso}
        )::int`,
        succeededLast24h: sql<number>`count(*) filter (
          where ${jobs.status} = 'succeeded' and ${jobs.updatedAt} >= ${dayAgoIso}
        )::int`,
        deadLast24h: sql<number>`count(*) filter (
          where ${jobs.status} = 'dead' and ${jobs.updatedAt} >= ${dayAgoIso}
        )::int`,
      })
      .from(jobs);

    return {
      distressedJobs: row?.distressedJobs ?? 0,
      pending: row?.pending ?? 0,
      running: row?.running ?? 0,
      retrying: row?.retrying ?? 0,
      succeededLast24h: row?.succeededLast24h ?? 0,
      deadLast24h: row?.deadLast24h ?? 0,
    };
  },
};

async function projectRows(rows: JobRow[], db: Db, now: Date): Promise<AdminJobSummary[]> {
  if (rows.length === 0) {
    return [];
  }
  const repositoryByJobId = await resolveRepositories(rows, db);
  return rows.map((job) => ({
    job,
    repository: repositoryByJobId.get(job.id) ?? null,
    errorSummary: summarizeAdminJobError(job.lastError),
    isDistressed: isAdminJobDistressed(job.status, job.runAfter, now),
  }));
}

async function resolveRepositories(
  rows: JobRow[],
  db: Db,
): Promise<Map<string, AdminJobRepositoryRef>> {
  const out = new Map<string, AdminJobRepositoryRef>();
  const repositoryIds = new Set<string>();
  const prIds = new Set<string>();

  for (const row of rows) {
    const payload = row.payload as JobPayload;
    if (payload.kind === "review_pull") {
      out.set(row.id, { id: null, fullName: `${payload.owner}/${payload.repo}` });
      continue;
    }
    if (payload.kind === "pr_index_backfill") {
      repositoryIds.add(payload.repositoryId);
      continue;
    }
    if (
      payload.kind === "decompose" ||
      payload.kind === "re_chapter" ||
      payload.kind === "sync_comments"
    ) {
      prIds.add(payload.prId);
    }
  }

  const repoIdList = [...repositoryIds];
  if (repoIdList.length > 0) {
    const repoRows = await db
      .select({ id: repositories.id, fullName: repositories.fullName })
      .from(repositories)
      .where(inArray(repositories.id, repoIdList));
    const byId = new Map(repoRows.map((repo) => [repo.id, repo]));
    for (const row of rows) {
      const payload = row.payload as JobPayload;
      if (payload.kind === "pr_index_backfill") {
        const repo = byId.get(payload.repositoryId);
        if (repo) {
          out.set(row.id, { id: repo.id, fullName: repo.fullName });
        }
      }
    }
  }

  const prIdList = [...prIds];
  if (prIdList.length > 0) {
    const prRows = await db
      .select({
        prId: pullRequests.id,
        repoId: repositories.id,
        fullName: repositories.fullName,
      })
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
      .where(inArray(pullRequests.id, prIdList));
    const byPrId = new Map(prRows.map((pr) => [pr.prId, pr]));
    for (const row of rows) {
      const payload = row.payload as JobPayload;
      if (
        payload.kind === "decompose" ||
        payload.kind === "re_chapter" ||
        payload.kind === "sync_comments"
      ) {
        const pr = byPrId.get(payload.prId);
        if (pr) {
          out.set(row.id, { id: pr.repoId, fullName: pr.fullName });
        }
      }
    }
  }

  return out;
}
