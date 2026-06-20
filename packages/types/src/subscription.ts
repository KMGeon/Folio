import { z } from "zod";
import { IsoDateTimeSchema, enumFromConst } from "./common.js";

export const SUBSCRIPTION_PLAN = {
  FREE: "free",
  PRO: "pro",
  TEAM: "team",
} as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLAN)[keyof typeof SUBSCRIPTION_PLAN];

export const SUBSCRIPTION_STATUS = {
  TRIALING: "trialing",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

// TODO(F3): Stripe-specific fields (customer/subscription ids, price) live in P1.
export const SubscriptionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  plan: enumFromConst(SUBSCRIPTION_PLAN),
  status: enumFromConst(SUBSCRIPTION_STATUS),
  trialEndsAt: IsoDateTimeSchema.nullable(),
  currentPeriodEnd: IsoDateTimeSchema.nullable(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;
