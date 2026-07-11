import { usersRepo } from "@folio/db";
import type { usersRepo as DbUsersRepo } from "@folio/db";
import { GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionService } from "../../domain/auth/session.service.js";
import type { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";
import { AuthFacade } from "./auth.facade.js";

type FolioDbModule = { usersRepo: typeof DbUsersRepo } & Record<string, unknown>;

vi.mock("@folio/db", async (importOriginal) => {
  const actual = (await importOriginal()) as FolioDbModule;
  return {
    ...actual,
    usersRepo: {
      ...actual.usersRepo,
      upsertByGithubId: vi.fn(),
      getByGithubId: vi.fn(),
      setGlobalStatus: vi.fn(),
      bootstrapInitialSystemAdmin: vi.fn(),
      approve: vi.fn(),
    },
  };
});

vi.mock("../../config.js", () => ({
  config: { SYSTEM_ADMIN_BOOTSTRAP_GITHUB_ID: 42 },
}));

const github = {
  exchangeCodeForUser: vi.fn(),
} as unknown as GitHubOAuthAdapter;
const sessions = {
  createForUser: vi.fn(),
} as unknown as SessionService;

const session = {
  token: "session-token",
  expiresAt: new Date("2026-08-10T00:00:00.000Z"),
};

describe("AuthFacade", () => {
  let facade: AuthFacade;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = new AuthFacade(github, sessions);
    vi.mocked(github.exchangeCodeForUser).mockResolvedValue({
      id: 42,
      login: "octocat",
      avatarUrl: "https://avatars.example/octocat",
      email: "octocat@example.com",
    });
    vi.mocked(sessions.createForUser).mockResolvedValue(session);
  });

  it("opens an OAuth session from the refreshed active global status", async () => {
    vi.mocked(usersRepo.upsertByGithubId).mockResolvedValue({
      id: "stale-user",
      status: "pending",
      globalStatus: GLOBAL_STATUS.PENDING,
    } as never);
    vi.mocked(usersRepo.getByGithubId).mockResolvedValue({
      id: "active-user",
      status: "pending",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);

    await expect(facade.completeLogin("oauth-code")).resolves.toEqual({
      status: "approved",
      userId: "active-user",
      ...session,
    });

    expect(usersRepo.bootstrapInitialSystemAdmin).toHaveBeenCalledWith(42);
    expect(usersRepo.getByGithubId).toHaveBeenCalledWith(42);
    expect(sessions.createForUser).toHaveBeenCalledWith("active-user");
  });

  it("binds an installation login to the exact installation during OAuth exchange", async () => {
    vi.mocked(usersRepo.upsertByGithubId).mockResolvedValue({ id: "active-user" } as never);
    vi.mocked(usersRepo.getByGithubId).mockResolvedValue({
      id: "active-user",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);

    const completion = await facade.completeLogin("oauth-code", 123);
    expect(completion).toEqual({
      status: "approved",
      userId: "active-user",
      ...session,
    });

    expect(github.exchangeCodeForUser).toHaveBeenCalledWith("oauth-code", 123);
    expect(JSON.stringify(completion)).not.toContain("gho_");
  });

  it("does not persist a user or session when installation verification fails", async () => {
    vi.mocked(github.exchangeCodeForUser).mockRejectedValue(new Error("installation denied"));

    await expect(facade.completeLogin("oauth-code", 999)).rejects.toThrow("installation denied");

    expect(usersRepo.upsertByGithubId).not.toHaveBeenCalled();
    expect(usersRepo.getByGithubId).not.toHaveBeenCalled();
    expect(sessions.createForUser).not.toHaveBeenCalled();
  });

  it("keeps the compatible pending response for a non-active refreshed user", async () => {
    vi.mocked(usersRepo.upsertByGithubId).mockResolvedValue({
      id: "u1",
      status: "approved",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);
    vi.mocked(usersRepo.getByGithubId).mockResolvedValue({
      id: "u1",
      status: "approved",
      globalStatus: GLOBAL_STATUS.PENDING,
    } as never);

    await expect(facade.completeLogin("oauth-code")).resolves.toEqual({ status: "pending" });

    expect(usersRepo.bootstrapInitialSystemAdmin).toHaveBeenCalledWith(42);
    expect(sessions.createForUser).not.toHaveBeenCalled();
  });

  it("opens a usable session after the repository bootstraps a fresh configured user", async () => {
    let storedUser: {
      id: string;
      githubUserId: number;
      status: string;
      globalStatus: GlobalStatus;
      isSystemAdmin: boolean;
    } = {
      id: "fresh-user",
      githubUserId: 42,
      status: "pending",
      globalStatus: GLOBAL_STATUS.PENDING,
      isSystemAdmin: false,
    };
    vi.mocked(usersRepo.upsertByGithubId).mockImplementation(async () => storedUser as never);
    vi.mocked(usersRepo.bootstrapInitialSystemAdmin).mockImplementation(async () => {
      storedUser = {
        ...storedUser,
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: true,
      };
      return storedUser as never;
    });
    vi.mocked(usersRepo.getByGithubId).mockImplementation(async () => storedUser as never);

    await expect(facade.completeLogin("oauth-code")).resolves.toEqual({
      status: "approved",
      userId: "fresh-user",
      ...session,
    });

    expect(usersRepo.bootstrapInitialSystemAdmin).toHaveBeenCalledWith(42);
    expect(usersRepo.getByGithubId).toHaveBeenCalledWith(42);
    expect(sessions.createForUser).toHaveBeenCalledWith("fresh-user");
  });

  it("keeps dev login working while writing active global status", async () => {
    vi.mocked(usersRepo.upsertByGithubId).mockResolvedValue({
      id: "dev-user",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);

    await expect(facade.completeDevLogin()).resolves.toEqual(session);

    expect(usersRepo.upsertByGithubId).toHaveBeenCalledWith({
      githubUserId: 1,
      login: "KMGeon",
      avatarUrl: "https://github.com/KMGeon.png?size=96",
      email: null,
      globalStatus: GLOBAL_STATUS.ACTIVE,
    });
    expect(sessions.createForUser).toHaveBeenCalledWith("dev-user");
  });

  it("reactivates an existing dev user through the global lifecycle", async () => {
    vi.mocked(usersRepo.upsertByGithubId).mockResolvedValue({
      id: "dev-user",
      globalStatus: GLOBAL_STATUS.PENDING,
    } as never);
    vi.mocked(usersRepo.setGlobalStatus).mockResolvedValue({
      id: "dev-user",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);

    await expect(facade.completeDevLogin()).resolves.toEqual(session);

    expect(usersRepo.setGlobalStatus).toHaveBeenCalledWith("dev-user", GLOBAL_STATUS.ACTIVE);
    expect(usersRepo.approve).not.toHaveBeenCalled();
    expect(sessions.createForUser).toHaveBeenCalledWith("dev-user");
  });
});
