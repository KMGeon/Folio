import {
  CHAPTER_STATUS,
  type HunkReference,
  type KeyChange,
  type ReviewHint,
  type Risk,
} from "@folio/types";
import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { pullRequests } from "./pull-requests.js";
import { revisions } from "./revisions.js";

/**
 * A chapter is an ordered slice of a revision's diff. `hunkRefs`, `keyChanges`,
 * `reviewHints` and `risks` are stored as typed jsonb. `order` is a LexoRank
 * string for stable insert-between reordering. `externalId` is the
 * engine-assigned id (stable across runs).
 */
export const chapters = pgTable(
  "chapters",
  {
    ...baseColumns(),
    externalId: text("external_id").notNull(),
    prId: uuid("pr_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => revisions.id, { onDelete: "cascade" }),
    order: text("order").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    hunkRefs: jsonb("hunk_refs").$type<HunkReference[]>().notNull().default([]),
    keyChanges: jsonb("key_changes").$type<KeyChange[]>().notNull().default([]),
    reviewHints: jsonb("review_hints").$type<ReviewHint[]>().notNull().default([]),
    risks: jsonb("risks").$type<Risk[]>().notNull().default([]),
    status: text("status", {
      enum: [CHAPTER_STATUS.DRAFT, CHAPTER_STATUS.PUBLISHED, CHAPTER_STATUS.EDITED],
    })
      .notNull()
      .default(CHAPTER_STATUS.PUBLISHED),
  },
  (table) => [
    uniqueIndex("chapters_revision_external_unique").on(table.revisionId, table.externalId),
  ],
);

export type ChapterRow = typeof chapters.$inferSelect;
export type ChapterInsert = typeof chapters.$inferInsert;
