import { z } from "zod";
import { IsoDateTimeSchema, enumFromConst } from "./common.js";

export const FOLIANT_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;
export type FoliantRole = (typeof FOLIANT_ROLE)[keyof typeof FOLIANT_ROLE];

/** A pointer back into the diff for a Foliant (chat) answer. */
export const CitationSchema = z.object({
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const FoliantMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: enumFromConst(FOLIANT_ROLE),
  content: z.string(),
  citations: z.array(CitationSchema),
  createdAt: IsoDateTimeSchema,
});
export type FoliantMessage = z.infer<typeof FoliantMessageSchema>;

export const FoliantThreadSchema = z.object({
  id: z.string(),
  prId: z.string(),
  revisionId: z.string().optional(),
  userId: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type FoliantThread = z.infer<typeof FoliantThreadSchema>;

// ─── Streaming events for A1/W6 ──────────────────────────────────────────────

export const FoliantStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({ type: z.literal("citation"), citation: CitationSchema }),
  z.object({ type: z.literal("done") }),
]);
export type FoliantStreamEvent = z.infer<typeof FoliantStreamEventSchema>;
