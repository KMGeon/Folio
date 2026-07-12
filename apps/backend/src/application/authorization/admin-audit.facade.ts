import { type AdminAuditRow, adminAuditRepo } from "@folio/db";
import {
  AdminAuditSnapshotSchema,
  AdminAuditTargetTypeSchema,
  type AdminAuditItem,
  type AdminAuditPage,
  type AuditAction,
} from "@folio/types";
import { Injectable } from "@nestjs/common";
import { decodeAdminPageCursor, encodeAdminPageCursor } from "./admin-page-cursor.js";

export interface AdminAuditListQuery {
  limit: number;
  q?: string;
  action?: AuditAction;
  workspaceId?: string;
  actorUserId?: string;
  targetId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

const snapshotKeys = [
  "globalStatus",
  "status",
  "role",
  "owner",
  "systemAdminUserId",
  "folioEnabled",
] as const;

@Injectable()
export class AdminAuditFacade {
  async list(query: AdminAuditListQuery): Promise<AdminAuditPage> {
    const page = await adminAuditRepo.list({
      limit: query.limit,
      q: query.q,
      action: query.action,
      workspaceId: query.workspaceId,
      actorUserId: query.actorUserId,
      targetId: query.targetId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      cursor: decodeAdminPageCursor(query.cursor),
    });
    const last = page.items.at(-1)?.audit;

    return {
      items: page.items.map(projectAdminAuditRow),
      nextCursor:
        page.hasMore && last
          ? encodeAdminPageCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }
}

export function projectAdminAuditRow(row: AdminAuditRow): AdminAuditItem {
  return {
    id: row.audit.id,
    action: row.audit.action,
    actor: {
      id: row.audit.actorUserId,
      login: row.actorLogin,
      avatarUrl: row.actorAvatarUrl,
    },
    target: {
      type: AdminAuditTargetTypeSchema.parse(row.audit.targetType),
      id: row.audit.targetId,
      label: row.targetLabel,
    },
    workspace:
      row.audit.workspaceId && row.workspaceLogin
        ? { id: row.audit.workspaceId, accountLogin: row.workspaceLogin }
        : null,
    before: projectSnapshot(row.audit.before),
    after: projectSnapshot(row.audit.after),
    createdAt: row.audit.createdAt.toISOString(),
  };
}

function projectSnapshot(value: unknown): AdminAuditItem["before"] {
  const source = isRecord(value) ? value : {};
  const safe: Record<string, unknown> = {};
  for (const key of snapshotKeys) {
    if (Object.hasOwn(source, key)) {
      safe[key] = source[key];
    }
  }
  return AdminAuditSnapshotSchema.parse(safe);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
