import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

// ─── Reviewer-level decision enums ───────────────────────────────────────────

export const REVIEW_STATE = {
  APPROVED: "APPROVED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  COMMENTED: "COMMENTED",
  DISMISSED: "DISMISSED",
  PENDING: "PENDING",
} as const;
export type ReviewState = (typeof REVIEW_STATE)[keyof typeof REVIEW_STATE];

export const REVIEWER_STATUS = {
  ...REVIEW_STATE,
  REQUESTED: "REQUESTED",
} as const;
export type ReviewerStatus = (typeof REVIEWER_STATUS)[keyof typeof REVIEWER_STATUS];

// ─── Per-file viewed state (file × revision × reviewer) ──────────────────────

export const FileReviewStateSchema = z.object({
  revisionId: z.string(),
  filePath: z.string().min(1),
  reviewerLogin: z.string(),
  viewed: z.boolean(),
  viewedAt: IsoDateTimeSchema.nullable(),
});
export type FileReviewState = z.infer<typeof FileReviewStateSchema>;

// ─── Per-chapter viewed state (chapter × revision × reviewer) ────────────────

export const ChapterReviewStateSchema = z.object({
  revisionId: z.string(),
  chapterId: z.string(),
  reviewerLogin: z.string(),
  viewed: z.boolean(),
  viewedAt: IsoDateTimeSchema.nullable(),
});
export type ChapterReviewState = z.infer<typeof ChapterReviewStateSchema>;

// ─── Rollup of viewed ids for a (revision, reviewer) ─────────────────────────

export const ReviewProgressSchema = z.object({
  revisionId: z.string(),
  reviewerLogin: z.string(),
  chapterIds: z.array(z.string()),
  keyChangeIds: z.array(z.string()),
  filePaths: z.array(z.string()),
});
export type ReviewProgress = z.infer<typeof ReviewProgressSchema>;
