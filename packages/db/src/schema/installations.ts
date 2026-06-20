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
  suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
});

export type InstallationRow = typeof installations.$inferSelect;
export type InstallationInsert = typeof installations.$inferInsert;
