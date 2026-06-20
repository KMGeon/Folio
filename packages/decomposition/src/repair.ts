// Bounded repair loop. On a Zod-schema or coverage failure we re-prompt the model
// with (a) its previous output echoed back and (b) the exact
// missing/extra/duplicate list, asking it to "fix and resubmit" — a retry-on-error
// contract for malformed model output. Capped at `maxRepairAttempts`.

import type { PullRequestFile } from "@folio/types";
import type { ChapterClient, ChapterClientRequest } from "./client.js";
import { coverageOf, formatCoverageFeedback, isFullyCovered } from "./coverage.js";
import { type AgentOutput, AgentOutputSchema } from "./schema.js";

export interface RepairContext {
  client: ChapterClient;
  system: string;
  /** The original user prompt (trusted context + guarded diff). */
  userPrompt: string;
  files: PullRequestFile[];
  maxRepairAttempts: number;
  signal?: AbortSignal;
}

export interface RepairOutcome {
  output: AgentOutput;
  /** True when at least one repair re-prompt was needed. */
  repaired: boolean;
}

/** Validate one raw tool input: Zod shape then hunk coverage. */
function validate(
  raw: unknown,
  files: PullRequestFile[],
): { ok: true; output: AgentOutput } | { ok: false; feedback: string } {
  const parsed = AgentOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      feedback: `Your emit_chapters output did not match the required schema. Fix these issues and resubmit the corrected JSON:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    };
  }
  const report = coverageOf(files, parsed.data.chapters);
  if (isFullyCovered(report)) {
    return { ok: true, output: parsed.data };
  }
  return { ok: false, feedback: formatCoverageFeedback(report) };
}

/**
 * Take the FIRST raw tool input and drive the repair loop. Returns the validated
 * output (with `repaired` provenance) or throws the last failure feedback as an
 * Error so the orchestrator can fall back.
 */
export async function runRepairLoop(firstRaw: unknown, ctx: RepairContext): Promise<RepairOutcome> {
  let result = validate(firstRaw, ctx.files);
  if (result.ok) {
    return { output: result.output, repaired: false };
  }

  let lastRaw = firstRaw;
  for (let attempt = 1; attempt <= ctx.maxRepairAttempts; attempt += 1) {
    const req: ChapterClientRequest = {
      system: ctx.system,
      messages: [
        { role: "user", content: ctx.userPrompt },
        { role: "assistant", content: renderPriorOutput(lastRaw) },
        { role: "user", content: result.feedback },
      ],
      signal: ctx.signal,
    };
    lastRaw = await ctx.client.emitChapters(req);
    result = validate(lastRaw, ctx.files);
    if (result.ok) {
      return { output: result.output, repaired: true };
    }
  }

  throw new Error(`Repair exhausted after ${ctx.maxRepairAttempts} attempts: ${result.feedback}`);
}

/** Echo the model's prior output back as assistant text for context. */
function renderPriorOutput(raw: unknown): string {
  let body: string;
  try {
    body = JSON.stringify(raw, null, 2);
  } catch {
    body = String(raw);
  }
  return `My previous emit_chapters output was:\n${body}`;
}
