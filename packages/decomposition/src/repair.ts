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

type ValidateResult =
  | { ok: true; output: AgentOutput }
  | { ok: false; output: AgentOutput | null; feedback: string };

/** Validate one raw tool input: Zod shape then hunk coverage. */
function validate(raw: unknown, files: PullRequestFile[]): ValidateResult {
  const parsed = AgentOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      output: null,
      feedback: `Your emit_chapters output did not match the required schema. Fix these issues and resubmit the corrected JSON:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    };
  }
  const report = coverageOf(files, parsed.data.chapters);
  if (isFullyCovered(report)) {
    return { ok: true, output: parsed.data };
  }
  // Schema-valid but coverage-incomplete: keep the output for best-effort return.
  return { ok: false, output: parsed.data, feedback: formatCoverageFeedback(report) };
}

/**
 * Take the FIRST raw tool input and drive the repair loop. Returns the validated
 * output (with `repaired` provenance). On exhaustion with a schema-valid attempt,
 * returns the best attempt so the caller's coverage sanitizer can fill the gaps.
 * Only throws if no attempt was ever schema-valid (deterministic fallback path).
 */
export async function runRepairLoop(firstRaw: unknown, ctx: RepairContext): Promise<RepairOutcome> {
  let result = validate(firstRaw, ctx.files);
  if (result.ok) {
    return { output: result.output, repaired: false };
  }

  let lastRaw = firstRaw;
  let bestValid: AgentOutput | null = result.output;
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
    if (result.output) {
      bestValid = result.output;
    }
  }

  // Exhausted. Keep the best schema-valid attempt so the caller's coverage
  // sanitizer preserves the LLM's chapters instead of discarding to deterministic.
  if (bestValid) {
    return { output: bestValid, repaired: true };
  }
  throw new Error(
    `Repair exhausted with no schema-valid output after ${ctx.maxRepairAttempts} attempts: ${result.feedback}`,
  );
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
