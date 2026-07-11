import { ACCOUNT_TYPE } from "@folio/types";
import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

// Stable authorization boundary, keyed by the GitHub numeric account id so it
// survives App reinstall (accountLogin is display-only and may change).
export const workspaces = pgTable("workspaces", {
  ...baseColumns(),
  githubAccountId: bigint("github_account_id", { mode: "number" }).notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type", {
    enum: [ACCOUNT_TYPE.USER, ACCOUNT_TYPE.ORGANIZATION],
  }).notNull(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;
