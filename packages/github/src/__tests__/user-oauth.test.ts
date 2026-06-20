import { describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeOAuthCode, getAuthenticatedUser } from "../auth/user-oauth.js";

describe("buildAuthorizeUrl", () => {
  it("builds the GitHub authorize URL with encoded params", () => {
    const url = buildAuthorizeUrl({
      clientId: "Iv1.abc",
      redirectUri: "http://localhost:8080/api/v1/auth/github/callback",
      state: "xyz",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("Iv1.abc");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8080/api/v1/auth/github/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("xyz");
  });
});

describe("exchangeOAuthCode", () => {
  it("posts the code and returns the access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "gho_token", token_type: "bearer" }),
    });
    const result = await exchangeOAuthCode({
      clientId: "id",
      clientSecret: "secret",
      code: "the-code",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.accessToken).toBe("gho_token");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws when GitHub returns an error payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "bad_verification_code" }),
    });
    await expect(
      exchangeOAuthCode({
        clientId: "id",
        clientSecret: "secret",
        code: "bad",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/bad_verification_code/);
  });
});

describe("getAuthenticatedUser", () => {
  it("maps the GitHub user payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 42,
        login: "octocat",
        avatar_url: "https://avatars/octocat",
        email: "octo@github.com",
      }),
    });
    const user = await getAuthenticatedUser({
      accessToken: "gho_token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(user).toEqual({
      id: 42,
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      email: "octo@github.com",
    });
  });
});
