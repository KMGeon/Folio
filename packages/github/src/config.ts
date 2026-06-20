import { z } from "zod";

/**
 * GitHub App credentials. Folio is a server-side GitHub App (not an OAuth app or
 * a PAT) because a custom Check Run `details_url` is App-only — see README.
 *
 * The private key may be supplied either as a raw PEM (with literal newlines or
 * `\n` escapes, e.g. from a `.env`) or base64-encoded (handy for secret stores
 * that mangle multi-line values). `normalizePrivateKey` collapses both forms to
 * a real PEM string with actual newlines.
 */
export interface GitHubConfig {
  appId: number;
  privateKey: string;
  webhookSecret: string;
  appSlug: string;
  clientId: string;
  clientSecret: string;
}

const PEM_HEADER = "-----BEGIN";

/** Decode base64-wrapped keys and turn `\n` escapes back into real newlines. */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  // If it doesn't look like a PEM, assume base64 and decode.
  if (!key.includes(PEM_HEADER)) {
    const decoded = Buffer.from(key, "base64").toString("utf8");
    if (decoded.includes(PEM_HEADER)) {
      key = decoded.trim();
    }
  }
  // `.env` loaders frequently deliver `\n` as two literal characters.
  if (key.includes("\\n") && !key.includes("\n")) {
    key = key.replace(/\\n/g, "\n");
  }
  return key;
}

export const GitHubConfigSchema: z.ZodType<GitHubConfig> = z.object({
  appId: z.coerce.number().int().positive(),
  privateKey: z.string().min(1).transform(normalizePrivateKey),
  webhookSecret: z.string().min(1),
  appSlug: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

/**
 * Build a {@link GitHubConfig} from `process.env`. Re-exported so F2 can wire it
 * into the backend's central env schema; callers pass `process.env` (or a test
 * double) explicitly to keep this pure.
 */
export function loadGitHubConfig(
  env: Record<string, string | undefined> = process.env,
): GitHubConfig {
  return GitHubConfigSchema.parse({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
    appSlug: env.GITHUB_APP_SLUG,
    clientId: env.GITHUB_APP_CLIENT_ID,
    clientSecret: env.GITHUB_APP_CLIENT_SECRET,
  });
}
