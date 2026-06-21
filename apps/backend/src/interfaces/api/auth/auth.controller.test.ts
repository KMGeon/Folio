import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsertByGithubId = vi.fn();
const getById = vi.fn();
const listPending = vi.fn();
const approve = vi.fn();
const getByFullName = vi.fn();
const sessionStore = new Map<string, { userId: string; expiresAt: Date }>();

vi.mock("@folio/db", () => ({
  USER_STATUS: {
    PENDING: "pending",
    APPROVED: "approved",
  },
  usersRepo: {
    upsertByGithubId: (...args: unknown[]) => upsertByGithubId(...args),
    getById: (...args: unknown[]) => getById(...args),
    listPending: (...args: unknown[]) => listPending(...args),
    approve: (...args: unknown[]) => approve(...args),
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
    exchangeOAuthCode: vi.fn(async () => ({ accessToken: "gho_x" })),
    getAuthenticatedUser: vi.fn(async () => ({
      id: 7,
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      email: null,
    })),
  };
});

async function createServer() {
  vi.resetModules();
  const cookieParser = (await import("cookie-parser")).default;
  const { AppModule } = await import("../../../app.module.js");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(cookieParser());
  await app.init();
  return app;
}

describe("auth routes", () => {
  afterEach(() => {
    sessionStore.clear();
    vi.clearAllMocks();
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

  it("completes login for a GitHub App installation callback without oauth state", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      status: "approved",
    });
    const app = await createServer();
    const res = await request(app.getHttpServer()).get(
      "/api/v1/auth/github/callback?code=good&installation_id=123&setup_action=install",
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/");
    expect((res.headers["set-cookie"] as unknown as string[]).join()).toContain("folio_session");
    await app.close();
  });

  it("records a new pending user but does not create a session until approved", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "new-reviewer",
      avatarUrl: "https://avatars/new-reviewer",
      status: "pending",
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
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
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
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
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

  it("lets KMGeon list pending users", async () => {
    getById.mockResolvedValue({
      id: "admin",
      login: "KMGeon",
      avatarUrl: "https://a",
      status: "approved",
    });
    upsertByGithubId.mockResolvedValue({
      id: "admin",
      login: "KMGeon",
      avatarUrl: "https://a",
      status: "approved",
    });
    listPending.mockResolvedValue([
      {
        id: "u2",
        login: "new-reviewer",
        avatarUrl: "https://avatars/new-reviewer",
        email: null,
        createdAt: new Date("2026-06-21T00:00:00.000Z"),
      },
    ]);

    const app = await createServer();
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );

    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/admin/users/pending")
      .set("Cookie", sessionCookie ?? "");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { users: [{ id: "u2", login: "new-reviewer" }] },
    });
    await app.close();
  });

  it("rejects pending-user administration from non-admin users", async () => {
    getById.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
    });

    const app = await createServer();
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );

    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/admin/users/pending")
      .set("Cookie", sessionCookie ?? "");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("admin_only");
    await app.close();
  });

  it("lets KMGeon approve a pending user", async () => {
    getById.mockResolvedValue({
      id: "admin",
      login: "KMGeon",
      avatarUrl: "https://a",
      status: "approved",
    });
    upsertByGithubId.mockResolvedValue({
      id: "admin",
      login: "KMGeon",
      avatarUrl: "https://a",
      status: "approved",
    });
    approve.mockResolvedValue({
      id: "u2",
      login: "new-reviewer",
      avatarUrl: "https://avatars/new-reviewer",
      status: "approved",
    });

    const app = await createServer();
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/admin/users/u2/approve")
      .set("Cookie", sessionCookie ?? "");

    expect(res.status).toBe(201);
    expect(approve).toHaveBeenCalledWith("u2");
    expect(res.body).toMatchObject({
      success: true,
      data: { user: { id: "u2", login: "new-reviewer", status: "approved" } },
    });
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
    });
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://a",
      status: "approved",
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
