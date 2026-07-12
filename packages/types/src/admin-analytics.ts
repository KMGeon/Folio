import { z } from "zod";

export const AdminAnalyticsRangeSchema = z.enum(["7d", "30d"]);
export type AdminAnalyticsRange = z.infer<typeof AdminAnalyticsRangeSchema>;

const AdminAnalyticsCountSchema = z
  .object({
    key: z.string().min(1),
    value: z.number().int().nonnegative(),
  })
  .strict();

const AdminAnalyticsDaySchema = z
  .object({
    date: z.string().date(),
    jobs: z
      .object({
        succeeded: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        dead: z.number().int().nonnegative(),
      })
      .strict(),
    users: z.object({ created: z.number().int().nonnegative() }).strict(),
    workspaces: z
      .object({
        created: z.number().int().nonnegative(),
        enabledRepositories: z.number().int().nonnegative(),
      })
      .strict(),
    audit: z.object({ events: z.number().int().nonnegative() }).strict(),
  })
  .strict();
export type AdminAnalyticsDay = z.infer<typeof AdminAnalyticsDaySchema>;

// Aggregates deliberately contain only operational metadata, never job or review contents.
export const AdminAnalyticsPayloadSchema = z
  .object({
    range: AdminAnalyticsRangeSchema,
    days: z.array(AdminAnalyticsDaySchema).min(1).max(30),
    distributions: z
      .object({
        jobs: z.array(AdminAnalyticsCountSchema),
        users: z.array(AdminAnalyticsCountSchema),
        installations: z.array(AdminAnalyticsCountSchema),
        audit: z.array(AdminAnalyticsCountSchema),
        jobKinds: z.array(AdminAnalyticsCountSchema),
      })
      .strict(),
  })
  .strict();
export type AdminAnalyticsPayload = z.infer<typeof AdminAnalyticsPayloadSchema>;
