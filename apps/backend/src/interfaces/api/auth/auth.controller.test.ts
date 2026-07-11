import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyInstallationClaimToken } from "../../../domain/auth/installation-claim-token.js";

const originalEnv = { ...process.env };

const upsertByGithubId = vi.fn();
let latestUpsertedUser: unknown;
const getByGithubId = vi.fn(async (_githubUserId: number) => latestUpsertedUser);
const setGlobalStatus = vi.fn();
const getById = vi.fn();
const getByFullName = vi.fn();
const sessionStore = new Map<string, { userId: string; expiresAt: Date }>();
const githubMocks = vi.hoisted(() => ({
  exchangeOAuthCode: vi.fn(async () => ({ accessToken: "gho_secret" })),
  getAuthenticatedUser: vi.fn(async () => ({
    id: 7,
    login: "octocat",
    avatarUrl: "https://avatars/octocat",
    email: null,
  })),
  verifyUserInstallationAccess: vi.fn(async () => undefined),
}));

vi.mock("@folio/db", () => ({
  USER_STATUS: {
    PENDING: "pending",
    APPROVED: "approved",
  },
  usersRepo: {
    upsertByGithubId: async (input: unknown) => {
      latestUpsertedUser = await upsertByGithubId(input);
      return latestUpsertedUser;
    },
    getByGithubId: (githubUserId: number) => getByGithubId(githubUserId),
    setGlobalStatus: (id: string, globalStatus: string) => setGlobalStatus(id, globalStatus),
    getById: (id: string) => getById(id),
  },
  sessionsRepo: {
    create: vi.fn(async (input: { tokenHash: string; userId: string; expiresAt: Date }) => {
      sessionStore.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
      return { id: "s1", ...input };
    }),
    getByTokenHash: vi.fn(async (hash: string) => {
      const row = sessionStore.get(hash);
      return row ? { id: "s1", tokenHash: hash, ...row } : null;
    }),
    deleteByTokenHash: vi.fn(async (hash: string) => {
      sessionStore.delete(hash);
    }),
  },
  repositoriesRepo: { getByFullName: (...args: unknown[]) => getByFullName(...args) },
  installationsRepo: { getById: vi.fn() },
}));

// Identity comes from the OAuth adapter; stub it so no network/crypto is hit.
vi.mock("@folio/github", async () => {
  const actual = (await vi.importActual("@folio/github")) as Record<string, unknown>;
  return {
    ...actual,
    ...githubMocks,
  };
});

function configureProfile(profile: "dev" | "prd") {
  process.env = { ...originalEnv };
  delete process.env.SYSTEM_ADMIN_BOOTSTRAP_GITHUB_ID;
  process.env.APP_PROFILE = profile;
  process.env.NODE_ENV = profile === "prd" ? "production" : "development";
  process.env.WEB_ORIGIN = "http://localhost:5173";
  process.env.PUBLIC_API_BASE_URL = "http://localhost:8080";
  if (profile === "prd") {
    process.env.SUPABASE_DATABASE_URL = "postgresql://postgres:secret@localhost:5432/folio";
    process.env.GITHUB_APP_ID = "123456";
    process.env.GITHUB_APP_PRIVATE_KEY =
      "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_WEBHOOK_SECRET = "webhook-secret";
    process.env.GITHUB_APP_SLUG = "folio-dev";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.GITHUB_APP_CLIENT_SECRET = "client-secret";
    process.env.FOLIO_WEB_BASE_URL = "http://localhost:5173";
  }
}

async function createServer(profile: "dev" | "prd" = "prd", appSlug: string | null = "folio-dev") {
  vi.resetModules();
  configureProfile(profile);
  if (appSlug === null) {
    delete process.env.GITHUB_APP_SLUG;
  } else {
    process.env.GITHUB_APP_SLUG = appSlug;
  }
  const cookieParser = (await import("cookie-parser")).default;
  const { AppModule } = await import("../../../app.module.js");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(cookieParser());
  await app.init();
  return app;
}

async function initiateInstallation(app: Awaited<ReturnType<typeof createServer>>) {
  const initiation = await request(app.getHttpServer()).get("/api/v1/auth/github/install");
  const cookies = initiation.headers["set-cookie"] as unknown as string[];
  const stateCookie = cookies.find((cookie) => cookie.startsWith("folio_installation_state="));
  const location = new URL(initiation.headers.location as string);
  return {
    initiation,
    state: location.searchParams.get("state"),
    cookie: stateCookie?.split(";", 1)[0] ?? "",
  };
}

describe("auth routes", () => {
  afterEach(() => {
    sessionStore.clear();
    latestUpsertedUser = undefined;
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("login redirects to GitHub and sets a state cookie", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer()).get("/api/v1/auth/github/login?redirect=/x");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("https://github.com/login/oauth/authorize");
    expect((res.headers["set-cookie"] as unknown as string[]).join()).toContain(
      "folio_oauth_state",
    );
    await app.close();
  });

  it("installation initiation sets a fresh HttpOnly state cookie and redirects to GitHub", async () => {
    const app = await createServer();
    const first = await initiateInstallation(app);
    const second = await initiateInstallation(app);

    expect(first.initiation.status).toBe(302);
    expect(first.initiation.headers.location).toBe(
      `https://github.com/apps/folio-dev/installations/new?state=${first.state}`,
    );
    expect(first.cookie).toContain("folio_installation_state=");
    expect((first.initiation.headers["set-cookie"] as unknown as string[]).join()).toContain(
      "HttpOnly",
    );
    expect(first.state).not.toBe(second.state);
    await app.close();
  });

  it("installation initiation clears a pre-existing installation claim", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/install")
      .set("Cookie", "folio_installation_claim=stale-claim");

    expect(res.status).toBe(302);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((cookie) => cookie.startsWith("folio_installation_claim="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    expect(cookies.find((cookie) => cookie.startsWith("folio_installation_state="))).toContain(
      "HttpOnly",
    );
    await app.close();
  });

  it.each([
    ["absent", null],
    ["blank", "   "],
  ])("fails closed when the GitHub App slug is %s", async (_label, appSlug) => {
    const app = await createServer("dev", appSlug);
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/install")
      .set("Cookie", "folio_installation_state=stale-state; folio_installation_claim=stale-claim");

    expect(res.status).toBe(503);
    expect(res.headers.location).toBeUndefined();
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((cookie) => cookie.startsWith("folio_installation_claim="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    expect(cookies.find((cookie) => cookie.startsWith("folio_installation_state="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    await app.close();
  });

  it("dev login signs in as KMGeon without redirecting through GitHub", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "admin",
      login: "KMGeon",
      avatarUrl: "https://github.com/KMGeon.png",
      status: "approved",
      globalStatus: "active",
    });
    const app = await createServer("dev");
    const res = await request(app.getHttpServer()).get(
      "/api/v1/auth/github/login?redirect=/settings",
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/settings");
    expect((res.headers["set-cookie"] as unknown as string[]).join()).toContain("folio_session");
    expect(upsertByGithubId).toHaveBeenCalledWith({
      githubUserId: expect.any(Number),
      login: "KMGeon",
      avatarUrl: "https://github.com/KMGeon.png?size=96",
      email: null,
      globalStatus: "active",
    });
    await app.close();
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=c&state=wrong")
      .set("Cookie", "folio_oauth_state=right|/");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("oauth_state_mismatch");
    await app.close();
  });

  it("completes login on a valid callback and sets the session cookie", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      status: "approved",
      globalStatus: "active",
    });
    const app = await createServer();
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/dashboard");
    expect((res.headers["set-cookie"] as unknown as string[]).join()).toContain("folio_session");
    await app.close();
  });

  it("completes login for a state-bound GitHub App installation callback", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      status: "approved",
      globalStatus: "active",
    });
    const app = await createServer();
    const { cookie, state } = await initiateInstallation(app);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/auth/github/callback?code=good&installation_id=123&setup_action=install&state=${state}`,
      )
      .set("Cookie", cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      "http://localhost:5173/onboarding/install?installation_id=123",
    );
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.join()).toContain("folio_session");
    expect(cookies.find((item) => item.startsWith("folio_installation_state="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    const claimCookie = cookies
      .filter((cookie) => cookie.startsWith("folio_installation_claim="))
      .at(-1);
    expect(claimCookie).toContain("HttpOnly");
    expect(claimCookie).toContain("Max-Age=600");
    const token = claimCookie?.split(";", 1)[0]?.split("=", 2)[1];
    const proof = verifyInstallationClaimToken(token ?? "", "webhook-secret");
    expect(proof).toMatchObject({ userId: "u1", installationId: 123 });
    expect(proof?.expiresAt).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(githubMocks.verifyUserInstallationAccess).toHaveBeenCalledWith({
      accessToken: "gho_secret",
      installationId: 123,
    });
    expect(res.text).not.toContain("gho_secret");
    await app.close();
  });

  it.each([
    ["manual callback without setup action", "&state=valid", "valid"],
    ["callback with missing installation state", "&setup_action=install", "valid"],
    ["callback with missing installation state cookie", "&setup_action=install&state=valid", ""],
    ["callback with mismatched installation state", "&setup_action=install&state=wrong", "valid"],
    ["update callback", "&setup_action=update&state=valid", "valid"],
  ])("rejects %s before OAuth exchange", async (_label, suffix, cookieMode) => {
    const app = await createServer();
    const initiated = await initiateInstallation(app);
    const callbackSuffix = suffix.replaceAll("valid", initiated.state ?? "");
    const callbackCookie = cookieMode === "valid" ? initiated.cookie : "";

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/github/callback?code=good&installation_id=123${callbackSuffix}`)
      .set("Cookie", callbackCookie);

    expect(res.status).toBe(400);
    expect(githubMocks.exchangeOAuthCode).not.toHaveBeenCalled();
    const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    expect(cookies.find((item) => item.startsWith("folio_installation_state="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    expect(cookies.find((item) => item.startsWith("folio_installation_claim="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    await app.close();
  });

  it("rejects a replay after the installation state cookie has been cleared", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      status: "approved",
      globalStatus: "active",
    });
    const app = await createServer();
    const { cookie, state } = await initiateInstallation(app);
    const callback = `/api/v1/auth/github/callback?code=good&installation_id=123&setup_action=install&state=${state}`;

    const first = await request(app.getHttpServer()).get(callback).set("Cookie", cookie);
    const second = await request(app.getHttpServer()).get(callback);

    expect(first.status).toBe(302);
    expect(second.status).toBe(400);
    expect(githubMocks.exchangeOAuthCode).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it.each([
    [
      "an arbitrary installation id",
      new Error("GitHub user installation access check failed: HTTP 404"),
    ],
    ["a GitHub API failure", new Error("GitHub user installation access check failed: HTTP 503")],
  ])("does not mint a claim for %s", async (_label, failure) => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      status: "approved",
      globalStatus: "active",
    });
    githubMocks.verifyUserInstallationAccess.mockRejectedValueOnce(failure);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = await createServer();
    const { cookie, state } = await initiateInstallation(app);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/auth/github/callback?code=good&installation_id=999&setup_action=install&state=${state}`,
      )
      .set("Cookie", cookie);

    expect(res.status).not.toBe(302);
    expect(res.headers.location).toBeUndefined();
    const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    expect(cookies.find((cookie) => cookie.startsWith("folio_installation_claim="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    expect(cookies.find((item) => item.startsWith("folio_installation_state="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    expect(cookies.join()).not.toContain("gho_secret");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("gho_secret");
    expect(sessionStore.size).toBe(0);
    await app.close();
    errorLog.mockRestore();
  });

  it("does not mint an installation proof for a pending user", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "new-reviewer",
      avatarUrl: "https://avatars/new-reviewer",
      status: "pending",
      globalStatus: "pending",
    });
    const app = await createServer();
    const { cookie, state } = await initiateInstallation(app);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/auth/github/callback?code=good&installation_id=123&setup_action=install&state=${state}`,
      )
      .set("Cookie", cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/login?status=pending");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((cookie) => cookie.startsWith("folio_installation_claim="))).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    expect(githubMocks.verifyUserInstallationAccess).toHaveBeenCalledWith({
      accessToken: "gho_secret",
      installationId: 123,
    });
    await app.close();
  });

  it.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects invalid installation callback id %s",
    async (installationId) => {
      upsertByGithubId.mockResolvedValue({
        id: "u1",
        login: "octocat",
        avatarUrl: "https://avatars/octocat",
        status: "approved",
        globalStatus: "active",
      });
      const app = await createServer();
      const { cookie, state } = await initiateInstallation(app);

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/github/callback?code=good&installation_id=${installationId}&setup_action=install&state=${state}`,
        )
        .set("Cookie", cookie);

      expect(res.status).toBe(400);
      await app.close();
    },
  );

  it("records a new pending user but does not create a session until approved", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "new-reviewer",
      avatarUrl: "https://avatars/new-reviewer",
      status: "pending",
      globalStatus: "pending",
    });
    const app = await createServer();
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/login?status=pending");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const sessionCookie = cookies.find((c) => c.startsWith("folio_session="));
    expect(sessionCookie).toContain("Expires=Thu, 01 Jan 1970");
    expect(sessionStore.size).toBe(0);
    await app.close();
  });

  it("me returns 401 without a session", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    await app.close();
  });

  it("me returns the user with a valid session cookie", async () => {
    getById.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
      globalStatus: "active",
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
      globalStatus: "active",
    });
    const app = await createServer();
    // Drive a real login to mint a valid session cookie.
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie ?? "");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ success: true, data: { user: { login: "octocat" } } });
    await app.close();
  });

  it("me returns 401 when the session belongs to a pending user", async () => {
    getById.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "pending",
      globalStatus: "pending",
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
      globalStatus: "active",
    });
    const app = await createServer();
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie ?? "");

    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("unauthorized");
    await app.close();
  });

  it.each([
    ["get", "/api/v1/auth/admin/users/pending"],
    ["post", "/api/v1/auth/admin/users/u2/approve"],
  ] as const)("removes the legacy %s %s endpoint", async (method, path) => {
    const app = await createServer();

    const res = await request(app.getHttpServer())[method](path);

    expect(res.status).toBe(404);
    await app.close();
  });

  // Extra test (carried over from Task 7 review): a malformed/non-string folio_session
  // cookie value must not cause a 500 — the guard must return 401 cleanly.
  //
  // BUG (DONE_WITH_CONCERNS): cookie-parser's JSON revival can decode a cookie like
  // "j:{...}" into an object. SessionService.resolve() passes it straight to
  // createHash().update(), which throws ERR_INVALID_ARG_TYPE (expects string/Buffer).
  // The unhandled rejection surfaces as a 500 instead of 401.
  // Fix required in SessionService.resolve(): add `if (typeof token !== "string") return null;`
  // This test documents the current broken behavior; fix belongs in session.service.ts (Task 7 scope).
  it("me returns 401 (not 500) when folio_session cookie is a malformed non-string value", async () => {
    const app = await createServer();
    // Send a cookie header that parses to an object-like value via cookie-parser
    // (e.g. "folio_session=j:%7B%7D" triggers express cookie-parser JSON revival).
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", "folio_session=j:%7B%22bad%22%3A1%7D");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    await app.close();
  });

  // Fix 1: RepoAccessGuard 403 deny path — proves guard ordering (SessionAuthGuard runs first
  // and attaches req.user, then RepoAccessGuard reads user.login) and that an unknown repo
  // (getByFullName → null) results in repo_access_denied without any GitHub network call.
  it("GET review returns 403 repo_access_denied when repo is not found in db", async () => {
    getById.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
      globalStatus: "active",
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
      globalStatus: "active",
    });
    // repo unknown → userCanAccessRepo returns false → RepoAccessGuard denies
    getByFullName.mockResolvedValue(null);

    const app = await createServer();

    // Mint a valid session via the real login flow.
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );

    const res = await request(app.getHttpServer())
      .get("/api/v1/pulls/acme/widget/1/review")
      .set("Cookie", sessionCookie ?? "");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("repo_access_denied");
    await app.close();
  });

  // Fix 3: logout envelope — catches drift if the hand-mirrored JSON body changes,
  // since @Res() bypasses the global ApiResponseInterceptor.
  it("POST logout returns 200 with the success envelope", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer()).post("/api/v1/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
    await app.close();
  });
});
