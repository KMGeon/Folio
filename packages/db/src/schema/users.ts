import { GLOBAL_STATUS } from "@folio/types";
import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

// Legacy pre-RBAC status. Kept only during the migration window; superseded by
// globalStatus. See the Task 7 backfill (approved → active).
export const USER_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
    login: text("login").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    email: text("email"),
    status: text("status").$type<UserStatus>().notNull().default(USER_STATUS.PENDING),
    globalStatus: text("global_status", {
      enum: [GLOBAL_STATUS.PENDING, GLOBAL_STATUS.ACTIVE, GLOBAL_STATUS.SUSPENDED],
    })
      .notNull()
      .default(GLOBAL_STATUS.PENDING),
    isSystemAdmin: boolean("is_system_admin").notNull().default(false),
  },
  (table) => ({
    // Exactly one global system_admin (Decision 18); replaced only via transfer.
    oneSystemAdmin: uniqueIndex("one_system_admin")
      .on(table.isSystemAdmin)
      .where(sql`${table.isSystemAdmin} = true`),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
