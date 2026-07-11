import {
  createInstallationOctokit,
  exchangeOAuthCode,
  getAuthenticatedUser,
  getInstallationAccount,
  getUserRepoPermissionLevel,
  verifyUserInstallationAccess,
} from "@folio/github";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import { ACCOUNT_TYPE } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubOAuthAdapter } from "./github-oauth.adapter.js";

vi.mock("@folio/github", () => ({
  createInstallationOctokit: vi.fn(),
  exchangeOAuthCode: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getInstallationAccount: vi.fn(),
  getUserRepoPermissionLevel: vi.fn(),
  verifyUserInstallationAccess: vi.fn(),
}));

vi.mock("@folio/db", () => ({
  installationsRepo: { getById: vi.fn() },
  repositoriesRepo: { getByFullName: vi.fn() },
}));

describe("GitHubOAuthAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("uses the OAuth token transiently to verify the exact installation", async () => {
    const user = {
      id: 42,
      login: "octocat",
      avatarUrl: "https://avatars.example/octocat",
      email: null,
    };
    vi.mocked(exchangeOAuthCode).mockResolvedValue({ accessToken: "gho_secret" });
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user);

    await expect(new GitHubOAuthAdapter().exchangeCodeForUser("code", 123)).resolves.toEqual(user);

    expect(getAuthenticatedUser).toHaveBeenCalledWith({ accessToken: "gho_secret" });
    expect(verifyUserInstallationAccess).toHaveBeenCalledWith({
      accessToken: "gho_secret",
      installationId: 123,
    });
    expect(JSON.stringify(user)).not.toContain("gho_secret");
  });

  it("does not check an installation for an ordinary OAuth login", async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({ accessToken: "gho_secret" });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: 42,
      login: "octocat",
      avatarUrl: "https://avatars.example/octocat",
      email: null,
    });

    await new GitHubOAuthAdapter().exchangeCodeForUser("code");

    expect(verifyUserInstallationAccess).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub cannot verify installation access", async () => {
    vi.mocked(exchangeOAuthCode).mockResolvedValue({ accessToken: "gho_secret" });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: 42,
      login: "octocat",
      avatarUrl: "https://avatars.example/octocat",
      email: null,
    });
    vi.mocked(verifyUserInstallationAccess).mockRejectedValueOnce(new Error("GitHub unavailable"));

    await expect(new GitHubOAuthAdapter().exchangeCodeForUser("code", 123)).rejects.toThrow(
      "GitHub unavailable",
    );
  });

  it("bounds resolved repository permission calls and reuses one client per installation", async () => {
    const pending: ReturnType<typeof deferred<"read">>[] = [];
    let active = 0;
    let maxActive = 0;
    vi.mocked(createInstallationOctokit).mockImplementation(
      async (installationId) => ({ installationId }) as never,
    );
    vi.mocked(getUserRepoPermissionLevel).mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const call = deferred<"read">();
      pending.push(call);
      return call.promise.finally(() => {
        active -= 1;
      });
    });

    const resultPromise = new GitHubOAuthAdapter().getResolvedRepositoryPermissionLevels({
      installations: [
        { id: "installation-1", githubInstallationId: 101 },
        { id: "installation-2", githubInstallationId: 202 },
      ],
      repositories: Array.from({ length: 6 }, (_, index) => ({
        installationId: index < 3 ? "installation-1" : "installation-2",
        owner: "acme",
        repo: `repo-${index + 1}`,
      })),
      username: "octocat",
    });

    await vi.waitFor(() => expect(getUserRepoPermissionLevel).toHaveBeenCalledTimes(4));
    expect(maxActive).toBe(4);
    pending.shift()?.resolve("read");
    await vi.waitFor(() => expect(getUserRepoPermissionLevel).toHaveBeenCalledTimes(5));
    pending.shift()?.resolve("read");
    await vi.waitFor(() => expect(getUserRepoPermissionLevel).toHaveBeenCalledTimes(6));
    for (const call of pending) {
      call.resolve("read");
    }

    await expect(resultPromise).resolves.toEqual(Array.from({ length: 6 }, () => "read"));
    expect(createInstallationOctokit).toHaveBeenCalledTimes(2);
    expect(createInstallationOctokit).toHaveBeenCalledWith(101);
    expect(createInstallationOctokit).toHaveBeenCalledWith(202);
    expect(repositoriesRepo.getByFullName).not.toHaveBeenCalled();
    expect(installationsRepo.getById).not.toHaveBeenCalled();
  });

  it("fails closed for missing installations and GitHub failures", async () => {
    vi.mocked(createInstallationOctokit).mockRejectedValue(new Error("token unavailable"));

    await expect(
      new GitHubOAuthAdapter().getResolvedRepositoryPermissionLevels({
        installations: [{ id: "installation-1", githubInstallationId: 101 }],
        repositories: [
          { installationId: "installation-1", owner: "acme", repo: "private" },
          { installationId: "missing", owner: "acme", repo: "unknown" },
        ],
        username: "octocat",
      }),
    ).resolves.toEqual(["none", "none"]);
    expect(getUserRepoPermissionLevel).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
