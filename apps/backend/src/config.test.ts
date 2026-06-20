import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

describe("backend config", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("loads the repo root .env when backend scripts run from apps/backend", async () => {
    const root = mkdtempSync(join(tmpdir(), "folio-config-"));
    const backendDir = join(root, "apps", "backend");
    mkdirSync(backendDir, { recursive: true });
    writeFileSync(
      join(root, ".env"),
      [
        "GITHUB_APP_ID=123456",
        "GITHUB_APP_WEBHOOK_SECRET=root-webhook-secret",
        "WEB_ORIGIN=http://localhost:5173",
      ].join("\n"),
    );

    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    process.chdir(backendDir);

    try {
      const { config } = await import("./config.js");

      expect(config.GITHUB_APP_ID).toBe("123456");
      expect(config.GITHUB_APP_WEBHOOK_SECRET).toBe("root-webhook-secret");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the dev profile by default and loads the repo root .env only", async () => {
    const root = mkdtempSync(join(tmpdir(), "folio-config-profile-"));
    const backendDir = join(root, "apps", "backend");
    mkdirSync(backendDir, { recursive: true });
    writeFileSync(join(root, ".env"), ["PORT=9000", "WEB_ORIGIN=http://localhost:4173"].join("\n"));
    writeFileSync(
      join(root, ".env.dev"),
      ["PORT=8080", "WEB_ORIGIN=http://localhost:5173"].join("\n"),
    );

    delete process.env.APP_PROFILE;
    delete process.env.PORT;
    delete process.env.WEB_ORIGIN;
    process.chdir(backendDir);

    try {
      const { config } = await import("./config.js");

      expect(config.APP_PROFILE).toBe("dev");
      expect(config.PORT).toBe(9000);
      expect(config.WEB_ORIGIN).toBe("http://localhost:4173");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads successfully when all required prd keys are present", async () => {
    const root = mkdtempSync(join(tmpdir(), "folio-config-prd-ok-"));
    const backendDir = join(root, "apps", "backend");
    mkdirSync(backendDir, { recursive: true });

    process.env.APP_PROFILE = "prd";
    process.env.DATABASE_URL = "postgres://localhost/folio";
    process.env.GITHUB_APP_ID = "123456";
    process.env.GITHUB_APP_PRIVATE_KEY =
      "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_WEBHOOK_SECRET = "webhook-secret";
    process.env.GITHUB_APP_SLUG = "folio-app";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.abc123";
    process.env.GITHUB_APP_CLIENT_SECRET = "client-secret-value";
    process.env.PUBLIC_API_BASE_URL = "https://api.folio.example.com";
    process.env.FOLIO_WEB_BASE_URL = "https://folio.example.com";
    process.chdir(backendDir);

    try {
      const { config } = await import("./config.js");

      expect(config.APP_PROFILE).toBe("prd");
      expect(config.GITHUB_APP_CLIENT_ID).toBe("Iv1.abc123");
      expect(config.GITHUB_APP_CLIENT_SECRET).toBe("client-secret-value");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires production secrets when the prd profile is active", async () => {
    const root = mkdtempSync(join(tmpdir(), "folio-config-prd-"));
    const backendDir = join(root, "apps", "backend");
    mkdirSync(backendDir, { recursive: true });
    writeFileSync(join(root, ".env.prd"), ["APP_PROFILE=prd", "PORT=8080"].join("\n"));

    delete process.env.APP_PROFILE;
    delete process.env.DATABASE_URL;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    delete process.env.GITHUB_APP_SLUG;
    delete process.env.GITHUB_APP_CLIENT_ID;
    delete process.env.GITHUB_APP_CLIENT_SECRET;
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.FOLIO_WEB_BASE_URL;
    process.env.APP_PROFILE = "prd";
    process.chdir(backendDir);

    try {
      await expect(import("./config.js")).rejects.toThrow(
        new RegExp(
          [
            "Missing required prd environment variables",
            "GITHUB_APP_SLUG",
            "PUBLIC_API_BASE_URL",
            "FOLIO_WEB_BASE_URL",
          ].join("[\\s\\S]*"),
        ),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the optional ollama + cooldown decomposition vars", async () => {
    const root = mkdtempSync(join(tmpdir(), "folio-config-ollama-"));
    const backendDir = join(root, "apps", "backend");
    mkdirSync(backendDir, { recursive: true });

    process.env.FOLIO_DECOMP_OLLAMA = "0";
    process.env.FOLIO_DECOMP_OLLAMA_URL = "http://host:1234/v1";
    process.env.FOLIO_DECOMP_OLLAMA_MODEL = "llama3.1:8b";
    process.env.FOLIO_DECOMP_CODEX_COOLDOWN_MS = "5000";
    process.chdir(backendDir);

    try {
      const { config } = await import("./config.js");

      // Verify the new optional keys are parsed without throwing and round-trip correctly.
      expect(config.FOLIO_DECOMP_OLLAMA).toBe("0");
      expect(config.FOLIO_DECOMP_OLLAMA_URL).toBe("http://host:1234/v1");
      expect(config.FOLIO_DECOMP_OLLAMA_MODEL).toBe("llama3.1:8b");
      expect(config.FOLIO_DECOMP_CODEX_COOLDOWN_MS).toBe(5000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a single env example aligned with the environment variables used by the app", () => {
    const root = new URL("../../../", import.meta.url);
    const example = readFileSync(new URL(".env.example", root), "utf8");
    const keys = new Set(
      example
        .split("\n")
        .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
        .filter((key): key is string => Boolean(key)),
    );

    expect(existsSync(new URL(".env.dev.example", root))).toBe(false);
    expect(existsSync(new URL(".env.prd.example", root))).toBe(false);
    expect(Array.from(keys).sort()).toEqual(
      [
        "APP_PROFILE",
        "DATABASE_URL",
        "FOLIO_DECOMP_CODEX_COOLDOWN_MS",
        "FOLIO_DECOMP_LLM",
        "FOLIO_DECOMP_MODEL",
        "FOLIO_DECOMP_OLLAMA",
        "FOLIO_DECOMP_OLLAMA_MODEL",
        "FOLIO_DECOMP_OLLAMA_URL",
        "FOLIO_WEB_BASE_URL",
        "GITHUB_APP_ID",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_CLIENT_SECRET",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_APP_SLUG",
        "GITHUB_APP_WEBHOOK_SECRET",
        "NEXT_PUBLIC_API_BASE_URL",
        "NODE_ENV",
        "OPENAI_API_KEY",
        "PORT",
        "PUBLIC_API_BASE_URL",
        "WEB_ORIGIN",
      ].sort(),
    );
  });
});
