import { desc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type WorkerHeartbeatRow, workerHeartbeats } from "../schema/worker-heartbeats.js";

export const workerHeartbeatsRepo = {
  async upsertHeartbeat(
    workerId: string,
    now: Date = new Date(),
    db: Db = getDb(),
  ): Promise<WorkerHeartbeatRow> {
    const existing = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId))
      .limit(1);
    if (existing[0]) {
      const [row] = await db
        .update(workerHeartbeats)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(eq(workerHeartbeats.workerId, workerId))
        .returning();
      if (!row) {
        throw new Error("workerHeartbeatsRepo.upsertHeartbeat: update returned no row");
      }
      return row;
    }
    const [row] = await db
      .insert(workerHeartbeats)
      .values({
        workerId,
        lastSeenAt: now,
        startedAt: now,
      })
      .returning();
    if (!row) {
      throw new Error("workerHeartbeatsRepo.upsertHeartbeat: insert returned no row");
    }
    return row;
  },

  async listAll(db: Db = getDb()): Promise<WorkerHeartbeatRow[]> {
    return db.select().from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt));
  },
};
