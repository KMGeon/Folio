import { z } from "zod";
import { IsoDateTimeSchema, enumFromConst } from "./common.js";

export const JOB_KIND = {
  DECOMPOSE: "decompose",
  RE_CHAPTER: "re_chapter",
  SYNC_COMMENTS: "sync_comments",
} as const;
export type JobKind = (typeof JOB_KIND)[keyof typeof JOB_KIND];

export const JOB_STATUS = {
  PENDING: "pending",
  CLAIMED: "claimed",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  DEAD: "dead",
} as const;
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

// ─── Per-kind payloads (discriminated union keyed by `kind`) ─────────────────

export const DecomposeJobPayloadSchema = z.object({
  kind: z.literal(JOB_KIND.DECOMPOSE),
  prId: z.string(),
  revisionId: z.string(),
});
export type DecomposeJobPayload = z.infer<typeof DecomposeJobPayloadSchema>;

export const ReChapterJobPayloadSchema = z.object({
  kind: z.literal(JOB_KIND.RE_CHAPTER),
  prId: z.string(),
  revisionId: z.string(),
  previousRevisionId: z.string(),
});
export type ReChapterJobPayload = z.infer<typeof ReChapterJobPayloadSchema>;

export const SyncCommentsJobPayloadSchema = z.object({
  kind: z.literal(JOB_KIND.SYNC_COMMENTS),
  prId: z.string(),
});
export type SyncCommentsJobPayload = z.infer<typeof SyncCommentsJobPayloadSchema>;

export const JobPayloadSchema = z.discriminatedUnion("kind", [
  DecomposeJobPayloadSchema,
  ReChapterJobPayloadSchema,
  SyncCommentsJobPayloadSchema,
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;

// ─── Queue row (SKIP-LOCKED queue contract shared by F4 + I2) ────────────────

export const JobSchema = z.object({
  id: z.string(),
  kind: enumFromConst(JOB_KIND),
  status: enumFromConst(JOB_STATUS),
  payload: JobPayloadSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  runAfter: IsoDateTimeSchema,
  claimedAt: IsoDateTimeSchema.nullable(),
  lockedBy: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Job = z.infer<typeof JobSchema>;
