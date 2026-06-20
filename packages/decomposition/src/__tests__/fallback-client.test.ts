import { describe, expect, it } from "vitest";
import { createCodexBreaker, createFallbackClient } from "../fallback-client.js";
import { StubClient } from "./helpers.js";

const req = { system: "S", messages: [] as { role: "user" | "assistant"; content: string }[] };

describe("createCodexBreaker", () => {
  it("opens for cooldown on failure and closes on success", () => {
    const b = createCodexBreaker(1000);
    expect(b.isOpen(0)).toBe(false);
    b.recordFailure(0);
    expect(b.isOpen(500)).toBe(true);
    expect(b.isOpen(1000)).toBe(false); // boundary: openUntil is exclusive
    b.recordFailure(2000);
    b.recordSuccess();
    expect(b.isOpen(2100)).toBe(false);
  });
});

describe("createFallbackClient", () => {
  it("uses primary on success and never touches secondary", async () => {
    const primary = new StubClient([{ chapters: [1] }], "codex");
    const secondary = new StubClient([{ chapters: [2] }], "ollama");
    const client = createFallbackClient(primary, secondary, { now: () => 0 });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [1] });
    expect(secondary.requests.length).toBe(0);
    expect(client.model).toBe("codex");
  });

  it("falls to secondary when primary throws, and opens the breaker", async () => {
    const primary = new StubClient([new Error("boom")], "codex");
    const secondary = new StubClient([{ chapters: [2] }], "ollama");
    const breaker = createCodexBreaker(1000);
    const client = createFallbackClient(primary, secondary, { breaker, now: () => 100 });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [2] });
    expect(secondary.requests.length).toBe(1);
    expect(breaker.isOpen(200)).toBe(true);
    expect(client.model).toBe("ollama"); // modelUsed reflects who actually answered
  });

  it("skips primary entirely while the breaker is open", async () => {
    const primary = new StubClient([{ chapters: [1] }], "codex");
    const secondary = new StubClient([{ chapters: [2] }], "ollama");
    const breaker = createCodexBreaker(1000);
    breaker.recordFailure(0);
    const client = createFallbackClient(primary, secondary, { breaker, now: () => 500 });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [2] });
    expect(primary.requests.length).toBe(0);
  });

  it("propagates the error when secondary is null (preserves deterministic safety net)", async () => {
    const primary = new StubClient([new Error("boom")], "codex");
    const client = createFallbackClient(primary, null, { now: () => 0 });
    await expect(client.emitChapters(req)).rejects.toThrow("boom");
  });

  it("propagates when secondary also throws", async () => {
    const primary = new StubClient([new Error("p")], "codex");
    const secondary = new StubClient([new Error("s")], "ollama");
    const client = createFallbackClient(primary, secondary, { now: () => 0 });
    await expect(client.emitChapters(req)).rejects.toThrow("s");
  });
});
