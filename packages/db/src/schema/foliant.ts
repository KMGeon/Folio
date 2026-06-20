import { type Citation, FOLIANT_ROLE } from "@folio/types";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { pullRequests } from "./pull-requests.js";
import { revisions } from "./revisions.js";
import { users } from "./users.js";

/** Foliant (diff chat) thread — W6 chat history. The A1 engine is stateless. */
export const foliantThreads = pgTable("foliant_threads", {
  ...baseColumns(),
  prId: uuid("pr_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").references(() => revisions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const foliantMessages = pgTable("foliant_messages", {
  ...baseColumns(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => foliantThreads.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: [FOLIANT_ROLE.USER, FOLIANT_ROLE.ASSISTANT, FOLIANT_ROLE.SYSTEM],
  }).notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<Citation[]>().notNull().default([]),
});

export type FoliantThreadRow = typeof foliantThreads.$inferSelect;
export type FoliantThreadInsert = typeof foliantThreads.$inferInsert;
export type FoliantMessageRow = typeof foliantMessages.$inferSelect;
export type FoliantMessageInsert = typeof foliantMessages.$inferInsert;
