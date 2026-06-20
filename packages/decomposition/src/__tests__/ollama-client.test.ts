import { afterEach, describe, expect, it, vi } from "vitest";
import { NoStructuredOutputError } from "../client.js";
import type { ResolvedConfig } from "../config.js";
import { createOllamaClient } from "../ollama-client.js";

const config = {
  ollamaUrl: "http://localhost:11434/v1",
  ollamaModel: "qwen2.5-coder:14b",
  temperature: 0.2,
} as unknown as ResolvedConfig;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOllamaClient", () => {
  it("posts to /chat/completions with the emit_chapters json_schema and the configured model", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{"chapters":[]}' } }] }));

    const client = createOllamaClient(config);
    await client.emitChapters({ system: "SYS", messages: [{ role: "user", content: "U" }] });

    expect(client.model).toBe("qwen2.5-coder:14b");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe("qwen2.5-coder:14b");
    expect(sent.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(sent.messages[1]).toEqual({ role: "user", content: "U" });
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.name).toBe("emit_chapters");
  });

  it("parses fenced/prose-wrapped JSON via parseStructuredPayload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'noise ```json\n{"chapters":[1]}\n```' } }] }),
    );
    const client = createOllamaClient(config);
    const out = await client.emitChapters({ system: "S", messages: [] });
    expect(out).toEqual({ chapters: [1] });
  });

  it("throws on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, false, 500));
    const client = createOllamaClient(config);
    await expect(client.emitChapters({ system: "S", messages: [] })).rejects.toThrow(/500/);
  });

  it("throws NoStructuredOutputError when content is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "" } }] }),
    );
    const client = createOllamaClient(config);
    await expect(client.emitChapters({ system: "S", messages: [] })).rejects.toBeInstanceOf(
      NoStructuredOutputError,
    );
  });
});
