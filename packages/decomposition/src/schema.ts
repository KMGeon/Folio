// Zod parsers for the `emit_chapters` tool input. The strict per-chapter shape
// lives in @folio/types. This package adds the top-level `AgentOutput` envelope
// returned by the model tool.

import { ChapterEmitSchema, KeyChangeEmitSchema, PrologueSchema } from "@folio/types";
import { z } from "zod";

export { ChapterEmitSchema, KeyChangeEmitSchema, PrologueSchema } from "@folio/types";
export type { ChapterEmit, KeyChangeEmit, Prologue } from "@folio/types";

/**
 * The full tool payload Claude must emit. `strictObject` rejects unknown keys so
 * a hallucinated extra field surfaces as a Zod error (→ repair), not silent data.
 */
export const AgentOutputSchema = z.strictObject({
  chapters: z.array(ChapterEmitSchema),
  // nullish: stubbed callers may omit it; the live Codex schema emits null when absent.
  prologue: PrologueSchema.nullish(),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/** Re-export the line-ref strict shape for key-change validation in tests. */
export { KeyChangeEmitSchema as keyChangeSchema };

/**
 * Parse-and-validate raw tool input. Throws `ZodError` on any shape violation;
 * the orchestrator catches it and routes into the repair loop.
 */
export function parseAgentOutput(raw: unknown): AgentOutput {
  return AgentOutputSchema.parse(raw);
}
