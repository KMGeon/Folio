import { bigint, boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { installations } from "./installations.js";
import { workspaces } from "./workspaces.js";

export const PR_INDEX_STATUS = {
  IDLE: "idle",
  BACKFILLING: "backfilling",
  READY: "ready",
  ERROR: "error",
} as const;
export type PrIndexStatus = (typeof PR_INDEX_STATUS)[keyof typeof PR_INDEX_STATUS];

export const repositories = pgTable("repositories", {
  ...baseColumns(),
  installationId: uuid("installation_id")
    .notNull()
    .references(() => installations.id, { onDelete: "cascade" }),
  // Nullable until the Task 7 backfill links every repo to its workspace.
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull().unique(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  private: boolean("private").notNull().default(false),
  defaultBranch: text("default_branch").notNull(),
  githubAccessActive: boolean("github_access_active").notNull().default(true),
  folioEnabled: boolean("folio_enabled").notNull().default(false),
  aiReplyEnabled: boolean("ai_reply_enabled").notNull().default(true),
  priority: text("priority", { enum: ["high", "normal", "low"] })
    .notNull()
    .default("normal"),
  // Dashboard open-board projection readiness (webhook/backfill).
  prIndexStatus: text("pr_index_status", {
    enum: [
      PR_INDEX_STATUS.IDLE,
      PR_INDEX_STATUS.BACKFILLING,
      PR_INDEX_STATUS.READY,
      PR_INDEX_STATUS.ERROR,
    ],
  })
    .notNull()
    .default(PR_INDEX_STATUS.IDLE),
  prIndexBackfilledAt: timestamp("pr_index_backfilled_at", { withTimezone: true, mode: "date" }),
});

export type RepositoryRow = typeof repositories.$inferSelect;
export type RepositoryInsert = typeof repositories.$inferInsert;
