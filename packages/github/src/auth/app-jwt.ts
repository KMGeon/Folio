import { createSign } from "node:crypto";
import type { GitHubConfig } from "../config.js";

/** GitHub caps App JWT lifetime at 10 minutes; we stay safely under it. */
export const MAX_JWT_TTL_SECONDS = 600;
/**
 * GitHub recommends backdating `iat` 60s to tolerate clock skew between us and
 * their auth servers (otherwise a slightly-fast clock yields "iat in future").
 */
const IAT_SKEW_SECONDS = 60;
/**
 * Default time-to-live below the 10-minute cap. Note the effective window is
 * `exp - iat`, which includes the backdated skew, so the ceiling on `ttlSeconds`
 * is `MAX_JWT_TTL_SECONDS - IAT_SKEW_SECONDS`.
 */
const DEFAULT_TTL_SECONDS = 480;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface AppJwtOptions {
  /** Override seconds-until-expiry (clamped to {@link MAX_JWT_TTL_SECONDS}). */
  ttlSeconds?: number;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  now?: () => number;
}

/**
 * Mint an RS256-signed GitHub App JWT. `iss` is the numeric App ID, `iat` is
 * backdated by {@link IAT_SKEW_SECONDS}, and `exp - iat` is clamped to ≤ 10 min.
 * This is the credential GitHub exchanges for an installation access token.
 */
export function createAppJwt(
  cfg: Pick<GitHubConfig, "appId" | "privateKey">,
  opts: AppJwtOptions = {},
): string {
  const nowMs = opts.now ? opts.now() : Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  const iat = nowSec - IAT_SKEW_SECONDS;
  // Clamp so the total window (exp - iat) never exceeds the 10-minute cap; the
  // backdated skew counts against the window per GitHub's validation.
  const maxTtlFromIat = MAX_JWT_TTL_SECONDS - IAT_SKEW_SECONDS;
  const ttl = Math.min(opts.ttlSeconds ?? DEFAULT_TTL_SECONDS, maxTtlFromIat);
  const exp = nowSec + ttl;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat, exp, iss: cfg.appId };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(cfg.privateKey);

  return `${signingInput}.${base64url(signature)}`;
}

/** Decode (without verifying) a JWT's claims — used by tests and diagnostics. */
export function decodeJwtClaims(jwt: string): {
  iat: number;
  exp: number;
  iss: number;
} {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Malformed JWT");
  }
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as { iat: number; exp: number; iss: number };
}
