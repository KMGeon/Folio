import type { AccountType } from "@folio/types";

export type GitHubInstallationIdentity = {
  githubAccountId: number;
  accountLogin: string;
  accountType: AccountType;
};

/** Domain boundary for resolving a verified GitHub installation to its stable account identity. */
export abstract class GitHubInstallationIdentityPort {
  abstract resolveInstallationIdentity(installationId: number): Promise<GitHubInstallationIdentity>;
}
