import { PULL_REQUEST_STATUS } from "@folio/types";
import { integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { repositories } from "./repositories.js";

export const pullRequests = pgTable(
  "pull_requests",
  {
    ...baseColumns(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrNumber: integer("github_pr_number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    authorLogin: text("author_login").notNull(),
    baseRef: text("base_ref").notNull(),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    status: text("status", {
      enum: [
        PULL_REQUEST_STATUS.OPEN,
        PULL_REQUEST_STATUS.MERGED,
        PULL_REQUEST_STATUS.CLOSED,
        PULL_REQUEST_STATUS.DRAFT,
      ],
    }).notNull(),
    htmlUrl: text("html_url").notNull(),
  },
  (table) => [
    uniqueIndex("pull_requests_repo_number_unique").on(table.repoId, table.githubPrNumber),
  ],
);

export type PullRequestRow = typeof pullRequests.$inferSelect;
export type PullRequestInsert = typeof pullRequests.$inferInsert;
