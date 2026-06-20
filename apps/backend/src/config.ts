import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { z } from "zod";

const originalEnvKeys = new Set(Object.keys(process.env));

loadEnvFiles([".env"]);
const activeProfile = resolveProfile(process.env);
if (!originalEnvKeys.has("APP_PROFILE")) {
  process.env.APP_PROFILE = activeProfile;
}
loadEnvFiles([`.env.${activeProfile}`]);

function loadEnvFiles(fileNames: string[]) {
  const envFiles = fileNames.flatMap((fileName) => [
    resolve(process.cwd(), "../..", fileName),
    resolve(process.cwd(), fileName),
  ]);

  for (const envFile of new Set(envFiles)) {
    if (!existsSync(envFile)) {
      continue;
    }
    const parsed = parseDotenv(readFileSync(envFile));
    for (const [key, value] of Object.entries(parsed)) {
      if (!originalEnvKeys.has(key)) {
        process.env[key] = value;
      }
    }
  }
}

function resolveProfile(env: NodeJS.ProcessEnv): "dev" | "prd" {
  if (env.APP_PROFILE === "dev" || env.APP_PROFILE === "prd") {
    return env.APP_PROFILE;
  }
  if (env.NODE_ENV === "production") {
    return "prd";
  }
  return "dev";
}

/**
 * Typed, validated runtime configuration for the Folio backend.
 * Parsed once at import time from process.env.
 *
 * Dev defaults keep the server bootable with an empty env; in production
 * (`NODE_ENV=production`) the GitHub App + database secrets become required so
 * we fail fast with a readable error instead of 500-ing at first webhook.
 */
const baseSchema = z.object({
  APP_PROFILE: z.enum(["dev", "prd"]).default("dev"),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Next.js web dev origin allowed for CORS (credentialed).
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().optional(),
  // Codex model used for PR decomposition into chapters. Codex auth comes from the
  // local CLI session (~/.codex, ChatGPT subscription), so there is no API key here.
  FOLIO_DECOMP_MODEL: z.string().default("gpt-5.5"),
  // Set to "0" to force the deterministic fallback and never spawn Codex.
  FOLIO_DECOMP_LLM: z.enum(["0", "1"]).optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  // Personal access token for the manual review trigger (read diff + write comment).
  GITHUB_PAT: z.string().optional(),
  // Base URL used to build "Open in Stage" deep links in the PR comment.
  FOLIO_WEB_BASE_URL: z.string().default("http://localhost:5173"),
});

export type Config = z.infer<typeof baseSchema>;

/**
 * In prd these must be present — refuse to boot otherwise so a
 * misconfigured deploy surfaces immediately rather than at first request.
 */
const REQUIRED_IN_PRD = [
  "DATABASE_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_WEBHOOK_SECRET",
  "GITHUB_PAT",
] as const satisfies readonly (keyof Config)[];

function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid backend configuration:\n${issues}`);
  }
  const cfg = parsed.data;

  if (cfg.APP_PROFILE === "prd") {
    const missing = REQUIRED_IN_PRD.filter((key) => !cfg[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required prd environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}`,
      );
    }
  }

  return cfg;
}

export const config: Config = loadConfig();
