// Anthropic tool-use call. Forces the `emit_chapters` tool via `tool_choice` and
// returns the raw tool input (an `unknown` to be Zod-validated by schema.ts).
//
// The engine talks to Anthropic through the small `ChapterClient` interface so
// tests inject a stub and never touch the network. `createAnthropicClient`
// builds the real one lazily (the SDK is only imported when used), so the
// fallback path works with no `@anthropic-ai/sdk` resolution at runtime.

import type { ResolvedConfig } from "./config.js";
import { EMIT_CHAPTERS_TOOL_NAME, emitChaptersTool } from "./tool.js";

/** One conversational turn fed to the model (system stays separate). */
export interface ChapterClientRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}

/**
 * Minimal client surface the engine depends on. The real implementation wraps
 * the Anthropic SDK; tests pass a stub returning canned tool inputs.
 */
export interface ChapterClient {
  /** The model id this client calls (surfaced as `modelUsed`). */
  readonly model: string;
  /**
   * Run one forced-tool turn. Resolves to the parsed tool input (`unknown`,
   * validated upstream). Rejects on transport / API errors.
   */
  emitChapters(req: ChapterClientRequest): Promise<unknown>;
}

/** Thrown when the model response contains no `emit_chapters` tool_use block. */
export class NoToolUseError extends Error {
  constructor(message = "Model did not return an emit_chapters tool_use block") {
    super(message);
    this.name = "NoToolUseError";
    Object.setPrototypeOf(this, NoToolUseError.prototype);
  }
}

// Structural subset of the SDK we rely on — lets us type the lazy import without
// a hard dependency at type-check time for consumers that never call the LLM.
interface AnthropicLike {
  messages: {
    create(
      body: unknown,
      opts?: { signal?: AbortSignal },
    ): Promise<{
      content: (
        | { type: "tool_use"; name: string; input: unknown }
        | { type: string; [k: string]: unknown }
      )[];
    }>;
  };
}

/**
 * Build the production client. Lazily imports `@anthropic-ai/sdk` on first call
 * so importing this package never requires the SDK to be present.
 */
export function createAnthropicClient(config: ResolvedConfig): ChapterClient {
  let sdk: AnthropicLike | null = null;

  async function getSdk(): Promise<AnthropicLike> {
    if (sdk) {
      return sdk;
    }
    const mod = await import("@anthropic-ai/sdk");
    const Anthropic = (mod as { default: new (o: { apiKey?: string }) => AnthropicLike }).default;
    sdk = new Anthropic({ apiKey: config.apiKey });
    return sdk;
  }

  return {
    model: config.model,
    async emitChapters(req: ChapterClientRequest): Promise<unknown> {
      const client = await getSdk();
      const response = await client.messages.create(
        {
          model: config.model,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          system: req.system,
          tools: [emitChaptersTool],
          tool_choice: { type: "tool", name: EMIT_CHAPTERS_TOOL_NAME },
          messages: req.messages,
        },
        { signal: req.signal },
      );

      for (const block of response.content) {
        if (block.type === "tool_use" && block.name === EMIT_CHAPTERS_TOOL_NAME) {
          return (block as { input: unknown }).input;
        }
      }
      throw new NoToolUseError();
    },
  };
}
