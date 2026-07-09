// Codex SDK call. Runs a single locked-down (read-only, no-network, no-approval)
// Codex turn that returns the emit_chapters payload as structured JSON via
// `outputSchema`, then parses it (an `unknown` re-validated by schema.ts).
//
// The engine talks to Codex through the small `ChapterClient` interface so tests
// inject a stub and never spawn the CLI. `createCodexClient` builds the real one
// lazily (the SDK is only imported when used), so offline deterministic evaluation
// works with no `@openai/codex-sdk` resolution at runtime.

import type { ResolvedConfig } from "./config.js";
import { emitChaptersTool } from "./tool.js";

/** One conversational turn fed to the model (system stays separate). */
export interface ChapterClientRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}

/**
 * Minimal client surface the engine depends on. The real implementation wraps
 * the Codex SDK; tests pass a stub returning canned payloads.
 */
export interface ChapterClient {
  /** The model id this client calls (surfaced as `modelUsed`). */
  readonly model: string;
  /**
   * Run one structured-output turn. Resolves to the parsed payload (`unknown`,
   * validated upstream). Rejects on transport / API errors.
   */
  emitChapters(req: ChapterClientRequest): Promise<unknown>;
}

/** Thrown when the model response contains no parseable structured payload. */
export class NoStructuredOutputError extends Error {
  constructor(message = "Model did not return a parseable emit_chapters payload") {
    super(message);
    this.name = "NoStructuredOutputError";
    Object.setPrototypeOf(this, NoStructuredOutputError.prototype);
  }
}

// Structural subset of the SDK we rely on — lets us type the lazy import without
// a hard dependency at type-check time for consumers that never call the LLM.
interface CodexThreadLike {
  run(
    input: string,
    turnOptions?: { outputSchema?: unknown; signal?: AbortSignal },
  ): Promise<{ finalResponse: string }>;
}
interface CodexLike {
  startThread(options?: {
    model?: string;
    sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
    approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
    skipGitRepoCheck?: boolean;
    networkAccessEnabled?: boolean;
    webSearchEnabled?: boolean;
  }): CodexThreadLike;
}

/**
 * Flatten the system prompt + conversation turns into one Codex input. Codex has
 * no separate system role, so each role is rendered as a labeled block; the repair
 * loop's prior-attempt + feedback turns survive the flattening.
 */
function renderInput(req: ChapterClientRequest): string {
  const parts = [`<instructions>\n${req.system}\n</instructions>`];
  for (const m of req.messages) {
    parts.push(`<${m.role}>\n${m.content}\n</${m.role}>`);
  }
  return parts.join("\n\n");
}

/** Extract the structured payload from a model final response (raw or fenced JSON). */
export function parseStructuredPayload(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tolerate prose-wrapped or fenced JSON: take the first balanced {...} span.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to the structured-output error below
      }
    }
    throw new NoStructuredOutputError();
  }
}

/**
 * Build the production client. Lazily imports `@openai/codex-sdk` on first call so
 * importing this package never requires the SDK to be present.
 */
export function createCodexClient(config: ResolvedConfig): ChapterClient {
  let codex: CodexLike | null = null;

  async function getCodex(): Promise<CodexLike> {
    if (codex) {
      return codex;
    }
    const mod = await import("@openai/codex-sdk");
    const Codex = (mod as { Codex: new () => CodexLike }).Codex;
    codex = new Codex();
    return codex;
  }

  return {
    model: config.model,
    async emitChapters(req: ChapterClientRequest): Promise<unknown> {
      const client = await getCodex();
      // Decomposition only reads the diff carried in the prompt — lock the agent
      // down so it cannot run commands, touch files, or reach the network.
      const thread = client.startThread({
        model: config.model,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        skipGitRepoCheck: true,
        networkAccessEnabled: false,
        webSearchEnabled: false,
      });
      const turn = await thread.run(renderInput(req), {
        outputSchema: emitChaptersTool.input_schema,
        signal: req.signal,
      });
      return parseStructuredPayload(turn.finalResponse);
    },
  };
}
