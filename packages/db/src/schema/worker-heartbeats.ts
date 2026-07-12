import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

// Operational liveness only — no secrets, env, or host credentials.
export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    ...baseColumns(),
    workerId: text("worker_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    workerIdUnique: uniqueIndex("worker_heartbeats_worker_id_uq").on(table.workerId),
  }),
);

export type WorkerHeartbeatRow = typeof workerHeartbeats.$inferSelect;
export type WorkerHeartbeatInsert = typeof workerHeartbeats.$inferInsert;
