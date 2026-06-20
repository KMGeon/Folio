import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { chapters } from "./chapters.js";
import { baseColumns } from "./columns.js";
import { revisions } from "./revisions.js";
import { users } from "./users.js";

/**
 * Per-file "mark as viewed" state, keyed by (user, revision, filePath).
 *
 * A row's presence means "viewed"; callers delete the row to auto-unmark when
 * the underlying file changes in a new revision (the schema supports both —
 * unique index makes mark idempotent, delete-by-key supports unmark).
 */
export const fileReviewState = pgTable(
  "file_review_state",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => revisions.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("file_review_state_user_revision_path_unique").on(
      table.userId,
      table.revisionId,
      table.filePath,
    ),
  ],
);

/**
 * Per-chapter "mark as viewed" state, keyed by (user, chapter). `revisionId` is
 * denormalized so progress can be computed per revision without joining
 * through `chapters`.
 */
export const chapterReviewState = pgTable(
  "chapter_review_state",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => revisions.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chapter_review_state_user_chapter_unique").on(table.userId, table.chapterId),
  ],
);

export type FileReviewStateRow = typeof fileReviewState.$inferSelect;
export type FileReviewStateInsert = typeof fileReviewState.$inferInsert;
export type ChapterReviewStateRow = typeof chapterReviewState.$inferSelect;
export type ChapterReviewStateInsert = typeof chapterReviewState.$inferInsert;
