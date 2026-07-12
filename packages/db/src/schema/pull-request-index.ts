import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { repositories } from "./repositories.js";

export type PullRequestIndexLabel = {
  name: string;
  color: string;
};

export const PR_INDEX_GITHUB_STATE = {
  OPEN: "open",
  CLOSED: "closed",
} as const;

export type PrIndexGithubState = (typeof PR_INDEX_GITHUB_STATE)[keyof typeof PR_INDEX_GITHUB_STATE];

/**
 * Board/list projection of GitHub PRs. Independent of `pull_requests`, which
 * only exists once Folio has started a review lifecycle for that PR.
 */
export const pullRequestIndex = pgTable(
  "pull_request_index",
  {
    ...baseColumns(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrNumber: integer("github_pr_number").notNull(),
    title: text("title").notNull(),
    authorLogin: text("author_login").notNull(),
    baseRef: text("base_ref").notNull(),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    githubState: text("github_state", {
      enum: [PR_INDEX_GITHUB_STATE.OPEN, PR_INDEX_GITHUB_STATE.CLOSED],
    }).notNull(),
    isDraft: boolean("is_draft").notNull().default(false),
    mergedAt: timestamp("merged_at", { withTimezone: true, mode: "date" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true, mode: "date" }).notNull(),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    changedFiles: integer("changed_files").notNull().default(0),
    labelsJson: jsonb("labels_json").$type<PullRequestIndexLabel[]>().notNull().default([]),
    htmlUrl: text("html_url").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("pull_request_index_repo_number_unique").on(table.repoId, table.githubPrNumber),
    index("pull_request_index_repo_updated_idx").on(table.repoId, table.githubUpdatedAt),
    index("pull_request_index_repo_state_updated_idx").on(
      table.repoId,
      table.githubState,
      table.githubUpdatedAt,
    ),
    index("pull_request_index_author_updated_idx").on(table.authorLogin, table.githubUpdatedAt),
  ],
);

export type PullRequestIndexRow = typeof pullRequestIndex.$inferSelect;
export type PullRequestIndexInsert = typeof pullRequestIndex.$inferInsert;
