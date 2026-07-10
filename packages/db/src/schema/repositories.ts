import { bigint, boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { installations } from "./installations.js";
import { workspaces } from "./workspaces.js";

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
  folioEnabled: boolean("folio_enabled").notNull().default(false),
});

export type RepositoryRow = typeof repositories.$inferSelect;
export type RepositoryInsert = typeof repositories.$inferInsert;
