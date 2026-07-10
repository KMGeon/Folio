import { ACCOUNT_TYPE } from "@folio/types";
import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

export const installations = pgTable("installations", {
  ...baseColumns(),
  githubInstallationId: bigint("github_installation_id", { mode: "number" }).notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type", {
    enum: [ACCOUNT_TYPE.USER, ACCOUNT_TYPE.ORGANIZATION],
  }).notNull(),
  // Stable numeric account id linking this install to its workspace (Decision 11).
  // Nullable until the Task 7 backfill, then tightened to NOT NULL.
  githubAccountId: bigint("github_account_id", { mode: "number" }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
});

export type InstallationRow = typeof installations.$inferSelect;
export type InstallationInsert = typeof installations.$inferInsert;
