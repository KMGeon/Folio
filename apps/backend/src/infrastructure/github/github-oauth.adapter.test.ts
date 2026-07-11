import { getInstallationAccount } from "@folio/github";
import { ACCOUNT_TYPE } from "@folio/types";
import { describe, expect, it, vi } from "vitest";
import { GitHubOAuthAdapter } from "./github-oauth.adapter.js";

vi.mock("@folio/github", () => ({
  getInstallationAccount: vi.fn(),
}));

vi.mock("@folio/db", () => ({
  installationsRepo: {},
  repositoriesRepo: {},
}));

describe("GitHubOAuthAdapter", () => {
  it("resolves installation account identity through app-level GitHub credentials", async () => {
    const identity = {
      githubAccountId: 42,
      accountLogin: "acme",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    };
    vi.mocked(getInstallationAccount).mockResolvedValue(identity);

    await expect(new GitHubOAuthAdapter().getInstallationAccount(123)).resolves.toBe(identity);
    expect(getInstallationAccount).toHaveBeenCalledWith(123);
  });
});
