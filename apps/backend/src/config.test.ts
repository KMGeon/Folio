import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("uses the dev profile by default and lets .env.dev override common .env values", async () => {
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
      expect(config.PORT).toBe(8080);
      expect(config.WEB_ORIGIN).toBe("http://localhost:5173");
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
    delete process.env.GITHUB_APP_CLIENT_ID;
    delete process.env.GITHUB_APP_CLIENT_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.APP_PROFILE = "prd";
    process.chdir(backendDir);

    try {
      await expect(import("./config.js")).rejects.toThrow(
        "Missing required prd environment variables",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
