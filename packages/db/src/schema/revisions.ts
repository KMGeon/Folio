import type { Prologue } from "@folio/types";
import { integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { pullRequests } from "./pull-requests.js";

/**
 * One revision = one snapshot of a PR head. The (baseSha, headSha,
 * mergeBaseSha) tuple aligns with the decomposition engine scope. The
 * generated prologue is stored as typed jsonb.
 */
export const revisions = pgTable(
  "revisions",
  {
    ...baseColumns(),
    prId: uuid("pr_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    headSha: text("head_sha").notNull(),
    baseSha: text("base_sha").notNull(),
    mergeBaseSha: text("merge_base_sha").notNull(),
    prologue: jsonb("prologue").$type<Prologue>(),
  },
  (table) => [uniqueIndex("revisions_pr_index_unique").on(table.prId, table.index)],
);

export type RevisionRow = typeof revisions.$inferSelect;
export type RevisionInsert = typeof revisions.$inferInsert;
