import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { chapters } from "./chapters.js";
import { baseColumns } from "./columns.js";

/**
 * Association of a file path to a chapter (a chapter spans one or more files).
 * Lets read models list "files in this chapter" without re-deriving from
 * `hunkRefs`, and anchors per-chapter-file review state.
 */
export const chapterFiles = pgTable(
  "chapter_files",
  {
    ...baseColumns(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
  },
  (table) => [uniqueIndex("chapter_files_chapter_path_unique").on(table.chapterId, table.filePath)],
);

export type ChapterFileRow = typeof chapterFiles.$inferSelect;
export type ChapterFileInsert = typeof chapterFiles.$inferInsert;
