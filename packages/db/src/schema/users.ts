import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

export const users = pgTable("users", {
  ...baseColumns(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
  login: text("login").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  email: text("email"),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
