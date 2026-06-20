import { z } from "zod";
import { ChapterSchema } from "./chapter.js";
import { PrologueSchema } from "./prologue.js";
import { PullRequestSchema, RevisionSchema } from "./pull-request.js";
import {
  ChapterReviewStateSchema,
  FileReviewStateSchema,
  ReviewProgressSchema,
} from "./review-state.js";

// Wire payloads (non-strict z.object) consumed by B2 → web via React Query, so
// the server can add fields the SPA doesn't yet read without rejecting parses.

export const ChaptersResponseSchema = z.object({
  pr: PullRequestSchema,
  revision: RevisionSchema,
  prologue: PrologueSchema.nullable(),
  chapters: z.array(ChapterSchema),
});
export type ChaptersResponse = z.infer<typeof ChaptersResponseSchema>;

export const PrListResponseSchema = z.object({
  pullRequests: z.array(PullRequestSchema),
});
export type PrListResponse = z.infer<typeof PrListResponseSchema>;

export const ReviewStateResponseSchema = z.object({
  progress: ReviewProgressSchema,
  files: z.array(FileReviewStateSchema),
  chapters: z.array(ChapterReviewStateSchema),
});
export type ReviewStateResponse = z.infer<typeof ReviewStateResponseSchema>;
