import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CODEX_COOLDOWN_MS,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  resolveConfig,
} from "../config.js";

const KEYS = [
  "FOLIO_DECOMP_OLLAMA",
  "FOLIO_DECOMP_OLLAMA_URL",
  "FOLIO_DECOMP_OLLAMA_MODEL",
  "FOLIO_DECOMP_CODEX_COOLDOWN_MS",
] as const;

afterEach(() => {
  for (const k of KEYS) {
    delete process.env[k];
  }
});

describe("resolveConfig — ollama + cooldown", () => {
  it("defaults ollama on, with documented url/model/cooldown", () => {
    const c = resolveConfig();
    expect(c.ollamaEnabled).toBe(true);
    expect(c.ollamaUrl).toBe(DEFAULT_OLLAMA_URL);
    expect(c.ollamaModel).toBe(DEFAULT_OLLAMA_MODEL);
    expect(c.codexCooldownMs).toBe(DEFAULT_CODEX_COOLDOWN_MS);
  });

  it("disables ollama when FOLIO_DECOMP_OLLAMA=0", () => {
    process.env.FOLIO_DECOMP_OLLAMA = "0";
    expect(resolveConfig().ollamaEnabled).toBe(false);
  });

  it("reads url/model/cooldown overrides from env", () => {
    process.env.FOLIO_DECOMP_OLLAMA_URL = "http://host:1234/v1";
    process.env.FOLIO_DECOMP_OLLAMA_MODEL = "llama3.1:8b";
    process.env.FOLIO_DECOMP_CODEX_COOLDOWN_MS = "5000";
    const c = resolveConfig();
    expect(c.ollamaUrl).toBe("http://host:1234/v1");
    expect(c.ollamaModel).toBe("llama3.1:8b");
    expect(c.codexCooldownMs).toBe(5000);
  });
});
