import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { createAppJwt } from "./auth/app-jwt.js";
import { getInstallationToken } from "./auth/installation-token.js";
import type { GitHubConfig } from "./config.js";

let appConfig: Pick<GitHubConfig, "appId" | "privateKey"> | null = null;

/**
 * Bind the client factory to App credentials. Call once at startup (typically
 * right after {@link configureInstallationAuth}).
 */
export function configureClients(cfg: Pick<GitHubConfig, "appId" | "privateKey">): void {
  appConfig = cfg;
}

/** Reset configured client state (test helper). */
export function resetClients(): void {
  appConfig = null;
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
 * Octokit scoped to one installation. Fetch the current installation token for
 * each client so long-lived workers don't keep using a client whose token expired.
 */
export async function createInstallationOctokit(installationId: number): Promise<Octokit> {
  requireConfig();
  const { token } = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}

/** Mint a bare App JWT (e.g. for manual diagnostics). */
export function appJwt(): string {
  return createAppJwt(requireConfig());
}
