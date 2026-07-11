import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const REF = { owner: "acme", repo: "widget", username: "octocat" };

function configureProfile(profile: "dev" | "prd") {
  process.env = { ...originalEnv };
  process.env.APP_PROFILE = profile;
  process.env.NODE_ENV = profile === "prd" ? "production" : "development";
  if (profile === "prd") {
    process.env.SUPABASE_DATABASE_URL = "postgresql://postgres:secret@localhost:5432/folio";
    process.env.GITHUB_APP_ID = "123456";
    process.env.GITHUB_APP_PRIVATE_KEY =
      "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_WEBHOOK_SECRET = "webhook-secret";
    process.env.GITHUB_APP_SLUG = "folio-dev";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.GITHUB_APP_CLIENT_SECRET = "client-secret";
    process.env.PUBLIC_API_BASE_URL = "https://api.folio.example.com";
    process.env.FOLIO_WEB_BASE_URL = "https://folio.example.com";
  }
}

async function createService(
  profile: "dev" | "prd",
  getLevel: ReturnType<typeof vi.fn>,
  getBatchLevels = vi.fn(),
) {
  vi.resetModules();
  configureProfile(profile);
  const { RepoAccessService } = await import("./repo-access.service.js");
  const adapter = {
    getUserRepoPermissionLevel: getLevel,
    getResolvedRepositoryPermissionLevels: getBatchLevels,
  } as unknown as ConstructorParameters<typeof RepoAccessService>[0];
  return new RepoAccessService(adapter);
}

describe("RepoAccessService", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("returns the adapter result", async () => {
    const getLevel = vi.fn().mockResolvedValue("write");
    const svc = await createService("prd", getLevel);
    expect(await svc.assertAccessAllowed(REF)).toBe(true);
  });

  it("caches a positive result within the TTL (one adapter call)", async () => {
    const getLevel = vi.fn().mockResolvedValue("write");
    const svc = await createService("prd", getLevel);
    await svc.assertAccessAllowed(REF);
    await svc.assertAccessAllowed(REF);
    expect(getLevel).toHaveBeenCalledTimes(1);
  });

  it("does not cache a denial (re-checks each time)", async () => {
    const getLevel = vi.fn().mockResolvedValue("none");
    const svc = await createService("prd", getLevel);
    await svc.assertAccessAllowed(REF);
    await svc.assertAccessAllowed(REF);
    expect(getLevel).toHaveBeenCalledTimes(2);
  });

  it("denies unreadable repositories in dev through the injected adapter", async () => {
    const getLevel = vi.fn().mockResolvedValue("none");
    const svc = await createService("dev", getLevel);

    await expect(svc.assertAccessAllowed(REF)).resolves.toBe(false);
    expect(getLevel).toHaveBeenCalledWith(REF.owner, REF.repo, REF.username);
  });
});

describe("RepoAccessService.filterReadableResolvedRepositories", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  const installations = [{ id: "installation-1", githubInstallationId: 101 }];
  const repositories = [
    { id: "repository-1", installationId: "installation-1", owner: "acme", name: "cached" },
    { id: "repository-2", installationId: "installation-1", owner: "acme", name: "denied" },
  ];

  it("reuses positive cache entries while rechecking prior denials", async () => {
    const getBatchLevels = vi
      .fn()
      .mockResolvedValueOnce(["read", "none"])
      .mockResolvedValueOnce(["read"]);
    const svc = await createService("prd", vi.fn(), getBatchLevels);

    await expect(
      svc.filterReadableResolvedRepositories({ installations, repositories, username: "octocat" }),
    ).resolves.toEqual([repositories[0]]);
    await expect(
      svc.filterReadableResolvedRepositories({ installations, repositories, username: "octocat" }),
    ).resolves.toEqual(repositories);

    expect(getBatchLevels).toHaveBeenNthCalledWith(2, {
      installations,
      repositories: [{ installationId: "installation-1", owner: "acme", repo: "denied" }],
      username: "octocat",
    });
  });

  it("fails closed without exposing repository rows when the batch adapter rejects", async () => {
    const svc = await createService(
      "prd",
      vi.fn(),
      vi.fn().mockRejectedValue(new Error("GitHub unavailable")),
    );

    await expect(
      svc.filterReadableResolvedRepositories({ installations, repositories, username: "octocat" }),
    ).resolves.toEqual([]);
  });

  it("excludes denied repositories from the dev dashboard batch path", async () => {
    const getBatchLevels = vi.fn().mockResolvedValue(["read", "none"]);
    const svc = await createService("dev", vi.fn(), getBatchLevels);

    await expect(
      svc.filterReadableResolvedRepositories({ installations, repositories, username: "octocat" }),
    ).resolves.toEqual([repositories[0]]);
    expect(getBatchLevels).toHaveBeenCalledWith({
      installations,
      repositories: [
        { installationId: "installation-1", owner: "acme", repo: "cached" },
        { installationId: "installation-1", owner: "acme", repo: "denied" },
      ],
      username: "octocat",
    });
  });
});

describe("RepoAccessService.getAccessLevel", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("returns the live level from the adapter", async () => {
    const getLevel = vi.fn().mockResolvedValue("write");
    const svc = await createService("prd", getLevel);
    expect(await svc.getAccessLevel(REF)).toBe("write");
  });

  it("does not elevate a maintain-level actor to admin in dev", async () => {
    const getLevel = vi.fn().mockResolvedValue("write");
    const svc = await createService("dev", getLevel);
    expect(await svc.assertLevelAtLeast(REF, "admin")).toBe(false);
    expect(getLevel).toHaveBeenCalledWith(REF.owner, REF.repo, REF.username);
  });
});

describe("RepoAccessService.assertLevelAtLeast", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("allows when the live level meets the requirement", async () => {
    const getLevel = vi.fn().mockResolvedValue("write");
    const svc = await createService("prd", getLevel);
    expect(await svc.assertLevelAtLeast(REF, "read")).toBe(true);
  });

  it("denies when the live level is below the requirement", async () => {
    const getLevel = vi.fn().mockResolvedValue("read");
    const svc = await createService("prd", getLevel);
    expect(await svc.assertLevelAtLeast(REF, "admin")).toBe(false);
  });
});
