import { COMMENT_SOURCE, type LineRef } from "@folio/types";
import { bigint, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { chapters } from "./chapters.js";
import { baseColumns } from "./columns.js";
import { pullRequests } from "./pull-requests.js";
import { revisions } from "./revisions.js";

/** A review comment, used by the I5 two-way GitHub sync. */
export const comments = pgTable("comments", {
  ...baseColumns(),
  prId: uuid("pr_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").references(() => revisions.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
  lineRef: jsonb("line_ref").$type<LineRef>(),
  authorLogin: text("author_login").notNull(),
  body: text("body").notNull(),
  githubCommentId: bigint("github_comment_id", { mode: "number" }),
  source: text("source", {
    enum: [COMMENT_SOURCE.FOLIO, COMMENT_SOURCE.GITHUB],
  }).notNull(),
});

export type CommentRow = typeof comments.$inferSelect;
export type CommentInsert = typeof comments.$inferInsert;
