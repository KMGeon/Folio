import { AUDIT_ACTION } from "@folio/types";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

// Persistent audit trail for authorization state changes (Decision 14).
export const auditLogs = pgTable("audit_logs", {
  ...baseColumns(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action", {
    enum: [
      AUDIT_ACTION.USER_APPROVE,
      AUDIT_ACTION.USER_SUSPEND,
      AUDIT_ACTION.MEMBER_SUSPEND,
      AUDIT_ACTION.MEMBER_RESTORE,
      AUDIT_ACTION.ROLE_CHANGE,
      AUDIT_ACTION.OWNER_TRANSFER,
      AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER,
      AUDIT_ACTION.WORKSPACE_CLAIM,
      AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
      AUDIT_ACTION.REPO_SETTINGS_CHANGE,
    ],
  }).notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  // Null for global (non-workspace) actions like user approve/suspend.
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
});

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
