import { z } from "zod";
import { IsoDateTimeSchema, enumFromConst } from "./common.js";
import { lineRefSchema } from "./diff.js";

export const COMMENT_SOURCE = {
  FOLIO: "folio",
  GITHUB: "github",
} as const;
export type CommentSource = (typeof COMMENT_SOURCE)[keyof typeof COMMENT_SOURCE];

/** A review comment, used by the I5 two-way GitHub sync. */
export const CommentSchema = z.object({
  id: z.string(),
  prId: z.string(),
  revisionId: z.string().optional(),
  chapterId: z.string().optional(),
  lineRef: lineRefSchema.optional(),
  authorLogin: z.string(),
  body: z.string(),
  githubCommentId: z.number().int().optional(),
  source: enumFromConst(COMMENT_SOURCE),
  createdAt: IsoDateTimeSchema,
});
export type Comment = z.infer<typeof CommentSchema>;
