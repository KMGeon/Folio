import { z } from "zod";
import { LexoRankSchema, enumFromConst } from "./common.js";
import { hunkReferenceSchema, lineRefSchema } from "./diff.js";
import { FOCUS_AREA_SEVERITY } from "./prologue.js";

// ─── Chapter status ──────────────────────────────────────────────────────────

export const CHAPTER_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  EDITED: "edited",
} as const;
export type ChapterStatus = (typeof CHAPTER_STATUS)[keyof typeof CHAPTER_STATUS];

// ─── Risk / ReviewHint / KeyChange ───────────────────────────────────────────

export const RiskSchema = z.object({
  file: z.string(),
  why: z.string(),
  severity: enumFromConst(FOCUS_AREA_SEVERITY),
});
export type Risk = z.infer<typeof RiskSchema>;

export const ReviewHintSchema = z.object({
  content: z.string(),
  lineRefs: z.array(lineRefSchema),
});
export type ReviewHint = z.infer<typeof ReviewHintSchema>;

export const KeyChangeSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  content: z.string(),
  lineRefs: z.array(lineRefSchema),
});
export type KeyChange = z.infer<typeof KeyChangeSchema>;

// ─── Engine / ingestion boundary (strict — what emit_chapters returns) ───────

export const KeyChangeEmitSchema = z.strictObject({
  /** A judgment-call question for a human reviewer, not source code. */
  content: z.string().min(1),
  lineRefs: z.array(lineRefSchema).min(1),
});
export type KeyChangeEmit = z.infer<typeof KeyChangeEmitSchema>;

export const ChapterEmitSchema = z.strictObject({
  id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  hunkRefs: z.array(hunkReferenceSchema),
  keyChanges: z.array(KeyChangeEmitSchema),
});
export type ChapterEmit = z.infer<typeof ChapterEmitSchema>;

// ─── Wire shape (non-strict — server → client) ───────────────────────────────
// Persisted chapters add PR/revision identity, ordering, review guidance,
// risk callouts, and lifecycle status to the model-emitted chapter.

export const ChapterSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  prId: z.string(),
  revisionId: z.string(),
  order: LexoRankSchema,
  title: z.string(),
  summary: z.string(),
  hunkRefs: z.array(hunkReferenceSchema),
  keyChanges: z.array(KeyChangeSchema),
  reviewHints: z.array(ReviewHintSchema),
  risks: z.array(RiskSchema),
  status: enumFromConst(CHAPTER_STATUS),
});
export type Chapter = z.infer<typeof ChapterSchema>;
