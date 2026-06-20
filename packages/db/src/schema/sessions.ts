import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";

export const sessions = pgTable("sessions", {
  ...baseColumns(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
