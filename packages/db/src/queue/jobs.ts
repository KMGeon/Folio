import {
  JOB_KIND,
  JOB_STATUS,
  type JobKind,
  type JobPayload,
  type JobStatus,
  type Job as JobWire,
} from "@folio/types";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type JobRow, jobs } from "../schema/jobs.js";

export { JOB_KIND, JOB_STATUS };
export type { JobKind, JobStatus, JobWire };

/**
 * The authoritative, in-process job shape (Date-based). This is the row as
 * stored, richer than the F3 wire `Job` (which uses ISO strings + a flattened
 * `claimedAt`). Use {@link toJobWire} at the API boundary (B2) to produce the
 * `@folio/types` `Job`.
 */
export type Job = JobRow;

/** Statuses a dedupe key considers "active" (blocks a duplicate enqueue). */
const ACTIVE_STATUSES = [
  JOB_STATUS.PENDING,
  JOB_STATUS.CLAIMED,
  JOB_STATUS.RUNNING,
  JOB_STATUS.FAILED,
] as const;

/** Statuses claimable by a worker (`runAfter` gating is applied separately). */
const CLAIMABLE_STATUSES = [JOB_STATUS.PENDING, JOB_STATUS.FAILED] as const;

const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 60 * 60 * 1_000; // 1 hour

/**
 * Exponential backoff for the n-th attempt (1-indexed): base * 2^(attempts-1),
 * capped. Returns a `Date` in the future for `runAfter`.
 */
export function backoffUntil(attempts: number, now: Date = new Date()): Date {
  const exp = Math.max(0, attempts - 1);
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_CAP_MS);
  return new Date(now.getTime() + delay);
}

/**
 * Project a stored job row onto the F3 `@folio/types` `Job` wire contract
 * (ISO-8601 strings; `claimedAt` is derived from the lease-bearing timestamp).
 * B2 uses this when serializing jobs over the API.
 */
export function toJobWire(row: Job): JobWire {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter.toISOString(),
    claimedAt: row.leaseExpiresAt ? row.leaseExpiresAt.toISOString() : null,
    lockedBy: row.lockedBy,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface EnqueueJobInput {
  kind: JobKind;
  payload: JobPayload;
  /** Stable dedupe key — convention `${repositoryId}:${headSha}:${kind}`. */
  dedupeKey?: string;
  maxAttempts?: number;
  /** Delay first attempt until this time (defaults to now). */
  runAfter?: Date;
}

/**
 * Insert a `pending` job. Idempotent: if an active job with the same
 * `dedupeKey` already exists (partial unique index), returns that job instead
 * of inserting (safe for I1 webhook retries).
 */
export async function enqueueJob(input: EnqueueJobInput, db: Db = getDb()): Promise<Job> {
  const values: typeof jobs.$inferInsert = {
    kind: input.kind,
    status: JOB_STATUS.PENDING,
    payload: input.payload,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    runAfter: input.runAfter ?? new Date(),
    dedupeKey: input.dedupeKey ?? null,
  };

  const inserted = await db.insert(jobs).values(values).onConflictDoNothing().returning();

  const row = inserted[0];
  if (row) {
    return row;
  }

  // Conflict on the active dedupe index — return the existing active job.
  if (input.dedupeKey) {
    const existing = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.dedupeKey, input.dedupeKey), inArray(jobs.status, [...ACTIVE_STATUSES])))
      .limit(1);
    const found = existing[0];
    if (found) {
      return found;
    }
  }
  throw new Error("enqueueJob: insert returned no row and no active duplicate was found");
}

export interface ClaimJobOptions {
  /** Restrict to these kinds; omit to claim any kind. */
  kinds?: JobKind[];
  /** Lease duration in ms; the worker must `renewJobLease` before expiry. */
  leaseMs: number;
  /** Stable worker identity, recorded in `lockedBy`. */
  workerId: string;
}

/**
 * Atomically claim the next runnable job using `FOR UPDATE SKIP LOCKED`, so
 * concurrent claimers never receive the same row. Transitions the row to
 * `running`, sets `lockedBy`/`leaseExpiresAt`, and increments `attempts`.
 * Returns `null` when no job is runnable.
 */
export async function claimJob(opts: ClaimJobOptions, db: Db = getDb()): Promise<Job | null> {
  const { kinds, leaseMs, workerId } = opts;
  const kindFilter =
    kinds && kinds.length > 0
      ? sql`and kind in (${sql.join(
          kinds.map((k) => sql`${k}`),
          sql`, `,
        )})`
      : sql``;

  // A single atomic statement picks one claimable, unlocked, due row (FOR
  // UPDATE SKIP LOCKED) and flips it to `running`. We only read back the id
  // here, then re-select through drizzle so the result maps to camelCase
  // `JobRow` fields (raw `db.execute` rows are snake_cased).
  const claimed = await db.execute<{ id: string }>(sql`
		update ${jobs} as j
		set status = ${JOB_STATUS.RUNNING},
		    locked_by = ${workerId},
		    lease_expires_at = now() + (${`${leaseMs} milliseconds`})::interval,
		    attempts = j.attempts + 1,
		    updated_at = now()
		from (
			select id from ${jobs}
			where status in (${sql.join(
        CLAIMABLE_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )})
			  and run_after <= now()
			  ${kindFilter}
			order by run_after asc, created_at asc
			for update skip locked
			limit 1
		) as next
		where j.id = next.id
		returning j.id;
	`);

  const claimedId = claimed[0]?.id;
  if (!claimedId) {
    return null;
  }
  const [row] = await db.select().from(jobs).where(eq(jobs.id, claimedId)).limit(1);
  return row ?? null;
}

/** Extend a running job's lease (I2 heartbeat). No-op for terminal jobs. */
export async function renewJobLease(
  jobId: string,
  leaseMs: number,
  db: Db = getDb(),
): Promise<void> {
  await db
    .update(jobs)
    .set({
      leaseExpiresAt: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, [JOB_STATUS.CLAIMED, JOB_STATUS.RUNNING])));
}

/** Mark a job `succeeded`, clearing its lease and storing an optional result. */
export async function completeJob(
  jobId: string,
  result?: unknown,
  db: Db = getDb(),
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: JOB_STATUS.SUCCEEDED,
      result: result ?? null,
      leaseExpiresAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Mark a job `failed` and schedule a retry with exponential backoff, or flip it
 * to `dead` once `attempts >= maxAttempts`. Clears the lease either way.
 */
export async function failJob(jobId: string, error: string, db: Db = getDb()): Promise<void> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) {
    return;
  }

  const exhausted = job.attempts >= job.maxAttempts;
  await db
    .update(jobs)
    .set({
      status: exhausted ? JOB_STATUS.DEAD : JOB_STATUS.FAILED,
      lastError: error,
      leaseExpiresAt: null,
      lockedBy: null,
      runAfter: exhausted ? job.runAfter : backoffUntil(job.attempts),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Reaper for crashed workers: any `claimed`/`running` job whose lease has
 * expired is returned to `pending` (or `dead` if attempts are exhausted) so it
 * can be re-claimed. Returns the number of jobs reclaimed.
 */
export async function reclaimExpiredJobs(db: Db = getDb()): Promise<number> {
  const reclaimed = await db
    .update(jobs)
    .set({
      status: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then ${JOB_STATUS.DEAD} else ${JOB_STATUS.PENDING} end`,
      leaseExpiresAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(jobs.status, [JOB_STATUS.CLAIMED, JOB_STATUS.RUNNING]),
        sql`${jobs.leaseExpiresAt} is not null`,
        lte(jobs.leaseExpiresAt, sql`now()`),
      ),
    )
    .returning({ id: jobs.id });
  return reclaimed.length;
}

/** Fetch a single job by id, or `null`. */
export async function getJob(jobId: string, db: Db = getDb()): Promise<Job | null> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

/** Build the conventional dedupe key for a decomposition-style job. */
export function dedupeKeyFor(repositoryId: string, headSha: string, kind: JobKind): string {
  return `${repositoryId}:${headSha}:${kind}`;
}
