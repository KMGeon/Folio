import { JOB_KIND, JOB_STATUS, type JobPayload } from "@folio/types";
import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

/**
 * SKIP-LOCKED job queue. The authoritative implementation of the F3 `Job`
 * contract: `kind` (not `type`), status `pending|claimed|running|succeeded|
 * failed|dead`, lease-based claiming, exponential backoff, and dedupe by
 * `(repositoryId, headSha, kind)` encoded into `dedupeKey`.
 */
export const jobs = pgTable(
  "jobs",
  {
    ...baseColumns(),
    kind: text("kind", {
      enum: [JOB_KIND.DECOMPOSE, JOB_KIND.RE_CHAPTER, JOB_KIND.SYNC_COMMENTS],
    }).notNull(),
    status: text("status", {
      enum: [
        JOB_STATUS.PENDING,
        JOB_STATUS.CLAIMED,
        JOB_STATUS.RUNNING,
        JOB_STATUS.SUCCEEDED,
        JOB_STATUS.FAILED,
        JOB_STATUS.DEAD,
      ],
    })
      .notNull()
      .default(JOB_STATUS.PENDING),
    payload: jsonb("payload").$type<JobPayload>().notNull(),
    result: jsonb("result").$type<unknown>(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
  },
  (table) => [
    // Partial unique index: only one *active* (not terminal) job per dedupe
    // key may exist. Succeeded/failed/dead jobs do not block re-enqueue.
    uniqueIndex("jobs_dedupe_key_active_unique")
      .on(table.dedupeKey)
      .where(
        sql`${table.dedupeKey} is not null and ${table.status} in ('pending','claimed','running','failed')`,
      ),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
