import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";

export const sessions = pgTable("sessions", {
  ...baseColumns(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // sha256 hex of the opaque cookie token; the raw token never touches the DB.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
