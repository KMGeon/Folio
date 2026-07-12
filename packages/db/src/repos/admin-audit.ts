import type { AuditAction } from "@folio/types";
import { and, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Db, getDb } from "../client.js";
import { type AuditLogRow, auditLogs } from "../schema/audit-logs.js";
import { repositories } from "../schema/repositories.js";
import { users } from "../schema/users.js";
import { workspaces } from "../schema/workspaces.js";

const actorUsers = alias(users, "actor_users");
const targetUsers = alias(users, "target_users");

export interface AdminAuditCursor {
  createdAt: Date;
  id: string;
}

export interface AdminAuditListInput {
  q?: string;
  action?: AuditAction;
  workspaceId?: string;
  actorUserId?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: AdminAuditCursor;
}

export interface AdminAuditRow {
  audit: AuditLogRow;
  actorLogin: string;
  actorAvatarUrl: string;
  targetLabel: string;
  workspaceLogin: string | null;
}

export interface AdminAuditPageRow {
  items: AdminAuditRow[];
  hasMore: boolean;
}

export const adminAuditRepo = {
  async list(input: AdminAuditListInput, db: Db = getDb()): Promise<AdminAuditPageRow> {
    const query = input.q?.trim();
    const searchPattern = query ? `%${query}%` : undefined;
    // Audit snapshots may contain sensitive state; Phase 1 search is display metadata only.
    const search = searchPattern
      ? or(
          ilike(actorUsers.login, searchPattern),
          ilike(targetUsers.login, searchPattern),
          ilike(repositories.fullName, searchPattern),
          ilike(workspaces.accountLogin, searchPattern),
        )
      : undefined;
    const afterCursor = input.cursor
      ? or(
          lt(auditLogs.createdAt, input.cursor.createdAt),
          and(eq(auditLogs.createdAt, input.cursor.createdAt), lt(auditLogs.id, input.cursor.id)),
        )
      : undefined;

    const rows = await db
      .select({
        audit: auditLogs,
        actorLogin: actorUsers.login,
        actorAvatarUrl: actorUsers.avatarUrl,
        targetLabel: sql<string>`coalesce(
          ${targetUsers.login},
          ${repositories.fullName},
          ${auditLogs.targetId}::text
        )`,
        workspaceLogin: workspaces.accountLogin,
      })
      .from(auditLogs)
      .innerJoin(actorUsers, eq(auditLogs.actorUserId, actorUsers.id))
      .leftJoin(
        targetUsers,
        and(
          inArray(auditLogs.targetType, ["user", "workspace_member"]),
          eq(auditLogs.targetId, targetUsers.id),
        ),
      )
      .leftJoin(
        repositories,
        and(eq(auditLogs.targetType, "repository"), eq(auditLogs.targetId, repositories.id)),
      )
      .leftJoin(workspaces, eq(auditLogs.workspaceId, workspaces.id))
      .where(
        and(
          search,
          input.action ? eq(auditLogs.action, input.action) : undefined,
          input.workspaceId ? eq(auditLogs.workspaceId, input.workspaceId) : undefined,
          input.actorUserId ? eq(auditLogs.actorUserId, input.actorUserId) : undefined,
          input.targetId ? eq(auditLogs.targetId, input.targetId) : undefined,
          input.from ? gte(auditLogs.createdAt, input.from) : undefined,
          input.to ? lte(auditLogs.createdAt, input.to) : undefined,
          afterCursor,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.limit + 1);

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  },
};
