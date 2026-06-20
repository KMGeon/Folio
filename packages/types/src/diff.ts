import { z } from "zod";
import { enumFromConst } from "./common.js";

// ─── Diff side ───────────────────────────────────────────────────────────────

export const DIFF_SIDE = {
  ADDITIONS: "additions",
  DELETIONS: "deletions",
} as const;
export type DiffSide = (typeof DIFF_SIDE)[keyof typeof DIFF_SIDE];

export const hunkReferenceSchema = z.strictObject({
  filePath: z.string().min(1),
  oldStart: z.number().int().nonnegative(),
});
export type HunkReference = z.infer<typeof hunkReferenceSchema>;

export const lineRefSchema = z
  .strictObject({
    filePath: z.string().min(1),
    side: enumFromConst(DIFF_SIDE),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  .refine((v) => v.startLine <= v.endLine, {
    message: "endLine must be greater than or equal to startLine",
    path: ["endLine"],
  });
export type LineRef = z.infer<typeof lineRefSchema>;

// ─── Parsed diff mechanics (shapes consumed by E1's parser) ──────────────────
// NOTE: E1 (@folio/diff) owns the parsing logic; these schemas are the canonical
// shapes it parses into and the wire payloads B2 returns.

export const FILE_STATUS = {
  ADDED: "added",
  MODIFIED: "modified",
  DELETED: "deleted",
  RENAMED: "renamed",
  MOVED: "moved",
} as const;
export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

export const LINE_TYPE = {
  CONTEXT: "context",
  ADDITION: "addition",
  DELETION: "deletion",
  HEADER: "header",
} as const;
export type LineType = (typeof LINE_TYPE)[keyof typeof LINE_TYPE];

export const diffLineSchema = z.object({
  type: enumFromConst(LINE_TYPE),
  content: z.string(),
  oldLineNumber: z.number().optional(),
  newLineNumber: z.number().optional(),
});
export type DiffLine = z.infer<typeof diffLineSchema>;

export const hunkSchema = z.object({
  header: z.string(),
  oldStart: z.number(),
  newStart: z.number(),
  oldLines: z.number(),
  newLines: z.number(),
  lines: z.array(diffLineSchema),
});
export type Hunk = z.infer<typeof hunkSchema>;

export const pullRequestFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  filename: z.string(),
  status: enumFromConst(FILE_STATUS),
  additions: z.number(),
  deletions: z.number(),
  hunks: z.array(hunkSchema),
  patch: z.string().optional(),
  isSymlink: z.boolean().optional(),
  symlinkTarget: z.string().optional(),
  oldSymlinkTarget: z.string().optional(),
});
export type PullRequestFile = z.infer<typeof pullRequestFileSchema>;

export const ParsedDiffSchema = z.object({
  files: z.array(pullRequestFileSchema),
});
export type ParsedDiff = z.infer<typeof ParsedDiffSchema>;
