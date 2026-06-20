// Ollama fallback client. Calls the OpenAI-compatible /chat/completions endpoint
// with the same emit_chapters json_schema Codex uses, so the parsed payload shape
// is identical and the repair loop / Zod validation downstream stay unchanged.

import {
  type ChapterClient,
  type ChapterClientRequest,
  NoStructuredOutputError,
  parseStructuredPayload,
} from "./client.js";
import type { ResolvedConfig } from "./config.js";
import { emitChaptersTool } from "./tool.js";

interface OllamaChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** Ollama has a real system role, so the system prompt stays a separate message. */
function toMessages(req: ChapterClientRequest): { role: string; content: string }[] {
  return [{ role: "system", content: req.system }, ...req.messages];
}

export function createOllamaClient(config: ResolvedConfig): ChapterClient {
  return {
    model: config.ollamaModel,
    async emitChapters(req: ChapterClientRequest): Promise<unknown> {
      const res = await fetch(`${config.ollamaUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          temperature: config.temperature,
          messages: toMessages(req),
          response_format: {
            type: "json_schema",
            json_schema: {
              name: emitChaptersTool.name,
              schema: emitChaptersTool.input_schema,
              strict: true,
            },
          },
        }),
        signal: req.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new NoStructuredOutputError();
      }
      return parseStructuredPayload(content);
    },
  };
}
