import { MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    ...baseColumns(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: [WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.REVIEWER],
    }).notNull(),
    status: text("status", {
      enum: [MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.SUSPENDED],
    }).notNull(),
    elevatedBy: uuid("elevated_by").references(() => users.id, { onDelete: "set null" }),
    suspendedBy: uuid("suspended_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueMember: uniqueIndex("workspace_members_workspace_user_uq").on(
      table.workspaceId,
      table.userId,
    ),
    // Enforce the single-owner invariant at the DB level via a partial unique index.
    oneOwner: uniqueIndex("one_owner_per_workspace")
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner'`),
  }),
);

export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
export type WorkspaceMemberInsert = typeof workspaceMembers.$inferInsert;
