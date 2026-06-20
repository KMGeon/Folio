import { z } from "zod";
import { IsoDateTimeSchema, ShaSchema, enumFromConst } from "./common.js";

export const PULL_REQUEST_STATUS = {
  OPEN: "open",
  MERGED: "merged",
  CLOSED: "closed",
  DRAFT: "draft",
} as const;
export type PullRequestStatus = (typeof PULL_REQUEST_STATUS)[keyof typeof PULL_REQUEST_STATUS];

export const PullRequestSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  githubPrNumber: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  authorLogin: z.string(),
  baseRef: z.string(),
  headRef: z.string(),
  headSha: ShaSchema,
  status: enumFromConst(PULL_REQUEST_STATUS),
  htmlUrl: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

/**
 * A revision is one snapshot of a PR's head. The (baseSha, headSha, mergeBaseSha)
 * tuple aligns with the decomposition engine scope tuple.
 */
export const RevisionSchema = z.object({
  id: z.string(),
  prId: z.string(),
  index: z.number().int().nonnegative(),
  headSha: ShaSchema,
  baseSha: ShaSchema,
  mergeBaseSha: ShaSchema,
  createdAt: IsoDateTimeSchema,
});
export type Revision = z.infer<typeof RevisionSchema>;
