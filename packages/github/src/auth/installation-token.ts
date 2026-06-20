import { createAppAuth } from "@octokit/auth-app";
import type { GitHubConfig } from "../config.js";

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

/**
 * How long before the real 1-hour expiry we proactively refresh. Refreshing ≥60s
 * early guarantees no in-flight request races a same-second expiry.
 */
const REFRESH_LEEWAY_MS = 60_000;

/** Minimal shape of the App-auth function we depend on (so tests can inject one). */
export type AppAuthFn = (opts: {
  type: "installation";
  installationId: number;
}) => Promise<{ token: string; expiresAt: string }>;

interface AuthState {
  auth: AppAuthFn;
  cache: Map<number, InstallationToken>;
  now: () => number;
}

let state: AuthState | null = null;

/**
 * Configure the installation-token subsystem. Call once at startup with the
 * loaded {@link GitHubConfig}; `createAppAuth` mints the App JWT under the hood
 * and exchanges it for installation tokens. Tests may pass `authOverride` to
 * avoid any crypto/network.
 */
export function configureInstallationAuth(
  cfg: Pick<GitHubConfig, "appId" | "privateKey">,
  opts: { authOverride?: AppAuthFn; now?: () => number } = {},
): void {
  const auth: AppAuthFn =
    opts.authOverride ??
    (createAppAuth({
      appId: cfg.appId,
      privateKey: cfg.privateKey,
    }) as unknown as AppAuthFn);
  state = { auth, cache: new Map(), now: opts.now ?? Date.now };
}

/** Reset cached state (test helper). */
export function resetInstallationAuth(): void {
  state = null;
}

function requireState(): AuthState {
  if (!state) {
    throw new Error(
      "Installation auth not configured — call configureInstallationAuth(config) first",
    );
  }
  return state;
}

/**
 * Get a valid installation access token, scoped to `installationId` and good for
 * ~1 hour. Cached per installation and refreshed ≥60s before expiry so callers
 * never use a token that could expire mid-request. Distinct installations keep
 * isolated cache entries (multi-tenant safe).
 */
export async function getInstallationToken(installationId: number): Promise<InstallationToken> {
  const s = requireState();
  const cached = s.cache.get(installationId);
  if (cached && cached.expiresAt.getTime() - s.now() > REFRESH_LEEWAY_MS) {
    return cached;
  }

  const result = await s.auth({ type: "installation", installationId });
  const fresh: InstallationToken = {
    token: result.token,
    expiresAt: new Date(result.expiresAt),
  };
  s.cache.set(installationId, fresh);
  return fresh;
}
