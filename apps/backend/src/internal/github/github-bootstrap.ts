import { configureClients, configureInstallationAuth, loadGitHubConfig } from "@folio/github";

let bootstrapped = false;

/**
 * Configure the @folio/github installation-token + client singletons once at
 * startup. Required by the repo-access guard (Model B authorizes via the
 * installation token). No-op in dev when App credentials are absent so the
 * server still boots; the guard surfaces a clear error if it's actually used.
 */
export function bootstrapGitHub(): void {
  if (bootstrapped) {
    return;
  }
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    console.warn("[folio] GitHub App credentials absent — installation auth not configured");
    return;
  }
  const cfg = loadGitHubConfig(process.env);
  configureInstallationAuth(cfg);
  configureClients(cfg);
  bootstrapped = true;
}
