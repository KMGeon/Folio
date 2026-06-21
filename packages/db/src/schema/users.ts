import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

export const USER_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const users = pgTable("users", {
  ...baseColumns(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
  login: text("login").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  email: text("email"),
  status: text("status").$type<UserStatus>().notNull().default(USER_STATUS.PENDING),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
