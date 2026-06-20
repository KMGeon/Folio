import { SUBSCRIPTION_PLAN, SUBSCRIPTION_STATUS } from "@folio/types";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { installations } from "./installations.js";

/**
 * Billing subscription per account (installation). Stripe-specific id/price
 * fields are owned by P1; this table holds plan + status for gating reads.
 */
export const subscriptions = pgTable("subscriptions", {
  ...baseColumns(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => installations.id, { onDelete: "cascade" }),
  plan: text("plan", {
    enum: [SUBSCRIPTION_PLAN.FREE, SUBSCRIPTION_PLAN.PRO, SUBSCRIPTION_PLAN.TEAM],
  }).notNull(),
  status: text("status", {
    enum: [
      SUBSCRIPTION_STATUS.TRIALING,
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.PAST_DUE,
      SUBSCRIPTION_STATUS.CANCELED,
    ],
  }).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true, mode: "date" }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "date" }),
});

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SubscriptionInsert = typeof subscriptions.$inferInsert;
