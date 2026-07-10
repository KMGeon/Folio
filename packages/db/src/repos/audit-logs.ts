import { desc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type AuditLogInsert, type AuditLogRow, auditLogs } from "../schema/audit-logs.js";

export const auditLogsRepo = {
  async record(input: AuditLogInsert, db: Db = getDb()): Promise<AuditLogRow> {
    const [row] = await db.insert(auditLogs).values(input).returning();
    if (!row) {
      throw new Error("auditLogsRepo.record: insert returned no row");
    }
    return row;
  },

  async listByWorkspace(workspaceId: string, db: Db = getDb()): Promise<AuditLogRow[]> {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(desc(auditLogs.createdAt));
  },
};
