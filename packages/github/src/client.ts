import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { createAppJwt } from "./auth/app-jwt.js";
import { getInstallationToken } from "./auth/installation-token.js";
import type { GitHubConfig } from "./config.js";

let appConfig: Pick<GitHubConfig, "appId" | "privateKey"> | null = null;
const installationClients = new Map<number, Octokit>();

/**
 * Bind the client factory to App credentials. Call once at startup (typically
 * right after {@link configureInstallationAuth}).
 */
export function configureClients(cfg: Pick<GitHubConfig, "appId" | "privateKey">): void {
  appConfig = cfg;
  installationClients.clear();
}

/** Reset memoized clients (test helper). */
export function resetClients(): void {
  appConfig = null;
  installationClients.clear();
}

function requireConfig(): Pick<GitHubConfig, "appId" | "privateKey"> {
  if (!appConfig) {
    throw new Error("Clients not configured — call configureClients(config) first");
  }
  return appConfig;
}

/**
 * App-level Octokit authenticated with the App JWT (not an installation token).
 * Use only for app-scoped endpoints (`GET /app`, `GET /app/installations`, …);
 * per-repo data needs an installation client.
 */
export function createAppOctokit(): Octokit {
  const cfg = requireConfig();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: cfg.appId, privateKey: cfg.privateKey },
  });
}

/**
 * Memoized Octokit scoped to one installation. The underlying installation token
 * is fetched/refreshed via {@link getInstallationToken}; the client is created
 * lazily and cached per installation so we don't re-handshake on every call.
 */
export async function createInstallationOctokit(installationId: number): Promise<Octokit> {
  requireConfig();
  const existing = installationClients.get(installationId);
  if (existing) {
    return existing;
  }

  const { token } = await getInstallationToken(installationId);
  const client = new Octokit({ auth: token });
  installationClients.set(installationId, client);
  return client;
}

/** Mint a bare App JWT (e.g. for manual diagnostics). */
export function appJwt(): string {
  return createAppJwt(requireConfig());
}
