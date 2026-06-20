import { describe, expect, it } from "vitest";
import { loadGitHubConfig, normalizePrivateKey } from "../config.js";

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----";

describe("normalizePrivateKey", () => {
  it("passes a real PEM through unchanged", () => {
    expect(normalizePrivateKey(PEM)).toBe(PEM);
  });

  it("decodes a base64-wrapped PEM", () => {
    const b64 = Buffer.from(PEM, "utf8").toString("base64");
    expect(normalizePrivateKey(b64)).toBe(PEM);
  });

  it("restores escaped newlines from .env-style values", () => {
    const escaped = PEM.replace(/\n/g, "\\n");
    expect(normalizePrivateKey(escaped)).toBe(PEM);
  });
});

describe("loadGitHubConfig", () => {
  const env = {
    GITHUB_APP_ID: "123",
    GITHUB_APP_PRIVATE_KEY: PEM,
    GITHUB_APP_WEBHOOK_SECRET: "whsec",
    GITHUB_APP_SLUG: "folio-app",
    GITHUB_APP_CLIENT_ID: "Iv1.abc",
    GITHUB_APP_CLIENT_SECRET: "client-secret",
  };

  it("coerces appId to a number and normalizes the key", () => {
    const cfg = loadGitHubConfig(env);
    expect(cfg.appId).toBe(123);
    expect(cfg.privateKey).toBe(PEM);
    expect(cfg.appSlug).toBe("folio-app");
  });

  it("throws when a required var is missing", () => {
    const { GITHUB_APP_WEBHOOK_SECRET, ...partial } = env;
    void GITHUB_APP_WEBHOOK_SECRET;
    expect(() => loadGitHubConfig(partial)).toThrow();
  });
});
